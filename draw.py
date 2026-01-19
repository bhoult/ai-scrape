#!/home/bhoult/programming/ai-scrape/.venv/bin/python3
"""
draw.py - Generate images using Z-Image Turbo

Usage:
    ./draw.py "a cat sitting on a windowsill"
    ./draw.py "a futuristic city at sunset" --steps 6 --seed 42
    ./draw.py "portrait of a warrior" --width 768 --height 1024 --output warrior.jpg
    ./draw.py "oil painting style" --image reference.jpg --strength 0.7
    ./draw.py "scene" --output img.jpg --metadata '{"turn": 1, "description": "..."}'
    ./draw.py --read-metadata img.jpg
    ./draw.py --regenerate img.jpg                    # Regenerate with new seed
    ./draw.py --regenerate img.jpg --seed 42          # Regenerate with specific seed

All generated images automatically store execution parameters in EXIF metadata.
"""

import argparse
import sys
import os
import json
from pathlib import Path


def embed_metadata_in_jpeg(image_path, metadata_json):
    """Embed JSON metadata in JPEG EXIF UserComment field."""
    try:
        import piexif
    except ImportError:
        print("Warning: piexif not installed. Metadata not embedded.", file=sys.stderr)
        print("Install with: pip install piexif", file=sys.stderr)
        return False

    try:
        # Read existing EXIF or create new
        try:
            exif_dict = piexif.load(image_path)
        except Exception:
            exif_dict = {"0th": {}, "Exif": {}, "GPS": {}, "1st": {}, "thumbnail": None}

        # Encode metadata as EXIF UserComment (with ASCII charset prefix)
        # UserComment format: 8-byte charset code + data
        user_comment = b'ASCII\x00\x00\x00' + metadata_json.encode('utf-8')
        exif_dict['Exif'][piexif.ExifIFD.UserComment] = user_comment

        # Write back to file
        exif_bytes = piexif.dump(exif_dict)
        piexif.insert(exif_bytes, image_path)
        return True
    except Exception as e:
        print(f"Warning: Failed to embed metadata: {e}", file=sys.stderr)
        return False


def read_metadata_from_jpeg(image_path):
    """Read JSON metadata from JPEG EXIF UserComment field."""
    try:
        import piexif
    except ImportError:
        print("Error: piexif not installed. Install with: pip install piexif", file=sys.stderr)
        return None

    try:
        exif_dict = piexif.load(image_path)
        user_comment = exif_dict.get('Exif', {}).get(piexif.ExifIFD.UserComment)

        if not user_comment:
            return None

        # UserComment format: 8-byte charset code + data
        # Check for ASCII prefix
        if user_comment.startswith(b'ASCII\x00\x00\x00'):
            json_str = user_comment[8:].decode('utf-8')
        else:
            # Try to decode as UTF-8 anyway
            json_str = user_comment[8:].decode('utf-8', errors='ignore')

        return json.loads(json_str)
    except Exception as e:
        print(f"Error reading metadata: {e}", file=sys.stderr)
        return None


def main():
    parser = argparse.ArgumentParser(description='Generate images using Z-Image Turbo')
    parser.add_argument('prompt', type=str, nargs='?', default=None, help='Text description of the image to generate')
    parser.add_argument('--output', '-o', type=str, default=None, help='Output filename (default: generated_<timestamp>.jpg)')
    parser.add_argument('--width', '-W', type=int, default=1024, help='Image width (default: 1024)')
    parser.add_argument('--height', '-H', type=int, default=1024, help='Image height (default: 1024)')
    parser.add_argument('--steps', '-s', type=int, default=8, help='Number of inference steps (default: 8, range: 5-15)')
    parser.add_argument('--seed', type=int, default=None, help='Random seed for reproducibility')
    parser.add_argument('--image', '-i', type=str, default=None, help='Reference image for img2img')
    parser.add_argument('--strength', type=float, default=0.6, help='How much to transform the reference image (0.0-1.0, default: 0.6)')
    parser.add_argument('--metadata', '-m', type=str, default=None, help='Additional JSON metadata to embed in the image')
    parser.add_argument('--read-metadata', type=str, default=None, metavar='IMAGE', help='Read and print metadata from an image, then exit')
    parser.add_argument('--regenerate', '-r', type=str, default=None, metavar='IMAGE', help='Regenerate image using metadata from existing image')

    args = parser.parse_args()

    # Handle read-metadata mode
    if args.read_metadata:
        if not os.path.exists(args.read_metadata):
            print(f"Error: Image not found: {args.read_metadata}", file=sys.stderr)
            sys.exit(1)
        metadata = read_metadata_from_jpeg(args.read_metadata)
        if metadata:
            print(json.dumps(metadata, indent=2))
        else:
            print("No metadata found in image.", file=sys.stderr)
            sys.exit(1)
        return

    # Handle regenerate mode - extract params from existing image
    if args.regenerate:
        if not os.path.exists(args.regenerate):
            print(f"Error: Image not found: {args.regenerate}", file=sys.stderr)
            sys.exit(1)
        metadata = read_metadata_from_jpeg(args.regenerate)
        if not metadata:
            print("Error: No metadata found in image to regenerate from.", file=sys.stderr)
            sys.exit(1)

        # Extract generation parameters from metadata
        gen_params = metadata.get('generation_params', {})
        if not gen_params.get('prompt'):
            print("Error: No prompt found in image metadata.", file=sys.stderr)
            sys.exit(1)

        # Use params from metadata, but allow command-line overrides
        args.prompt = gen_params.get('prompt')
        if args.width == 1024:  # Default value, use metadata
            args.width = gen_params.get('width', 1024)
        if args.height == 1024:
            args.height = gen_params.get('height', 1024)
        if args.steps == 8:
            args.steps = gen_params.get('steps', 8)
        if args.strength == 0.6:
            args.strength = gen_params.get('strength', 0.6)
        # Seed: use new random seed unless explicitly provided
        if args.seed is None:
            import random
            args.seed = random.randint(0, 2**32 - 1)
            print(f"Regenerating with new seed: {args.seed}")

        # Default output to same directory with _regen suffix
        if args.output is None:
            base = os.path.splitext(args.regenerate)[0]
            args.output = f"{base}_regen.jpg"

        # Preserve additional metadata from original
        args._original_metadata = {k: v for k, v in metadata.items() if k != 'generation_params'}

        print(f"Regenerating from: {args.regenerate}")

    # Prompt is required for image generation
    if not args.prompt:
        parser.error("prompt is required for image generation")

    # Import torch and diffusers here to show helpful error if not installed
    try:
        import torch
    except ImportError:
        print("Error: PyTorch not installed. Install with: pip install torch", file=sys.stderr)
        sys.exit(1)

    try:
        from diffusers import ZImagePipeline, ZImageImg2ImgPipeline
    except ImportError:
        print("Error: diffusers not installed or outdated.", file=sys.stderr)
        print("Install latest diffusers: pip install git+https://github.com/huggingface/diffusers", file=sys.stderr)
        sys.exit(1)

    # Check for CUDA
    if not torch.cuda.is_available():
        print("Error: CUDA not available. This model requires a CUDA-capable GPU.", file=sys.stderr)
        sys.exit(1)

    # Load reference image if provided
    input_image = None
    if args.image:
        from PIL import Image
        if not os.path.exists(args.image):
            print(f"Error: Reference image not found: {args.image}", file=sys.stderr)
            sys.exit(1)
        input_image = Image.open(args.image).convert('RGB')
        print(f"Using reference image: {args.image} (strength: {args.strength})")

    # Choose pipeline based on whether we have a reference image
    if input_image:
        print(f"Loading Z-Image Turbo img2img model...")
        pipe = ZImageImg2ImgPipeline.from_pretrained(
            "Tongyi-MAI/Z-Image-Turbo",
            torch_dtype=torch.bfloat16,
            low_cpu_mem_usage=True,
        )
    else:
        print(f"Loading Z-Image Turbo model...")
        pipe = ZImagePipeline.from_pretrained(
            "Tongyi-MAI/Z-Image-Turbo",
            torch_dtype=torch.bfloat16,
            low_cpu_mem_usage=True,
        )

    # Enable CPU offload by default to handle large model
    print("Enabling CPU offload...")
    pipe.enable_model_cpu_offload()

    # Try to enable flash attention if available
    try:
        pipe.transformer.set_attention_backend("flash")
    except Exception:
        pass  # Flash attention not available, continue without it

    # Set up generator for seed - always use a seed for reproducibility
    import random
    if args.seed is not None:
        actual_seed = args.seed
    else:
        actual_seed = random.randint(0, 2**32 - 1)
    generator = torch.Generator("cuda").manual_seed(actual_seed)
    print(f"Using seed: {actual_seed}")

    print(f"Generating {args.width}x{args.height} image with {args.steps} steps...")
    print(f"Prompt: {args.prompt}")

    # Generate image
    if input_image:
        result = pipe(
            prompt=args.prompt,
            image=input_image,
            strength=args.strength,
            height=args.height,
            width=args.width,
            num_inference_steps=args.steps,
            guidance_scale=0.0,  # Must be 0 for Turbo models
            generator=generator,
        )
    else:
        result = pipe(
            prompt=args.prompt,
            height=args.height,
            width=args.width,
            num_inference_steps=args.steps,
            guidance_scale=0.0,  # Must be 0 for Turbo models
            generator=generator,
        )

    image = result.images[0]

    # Determine output filename
    if args.output:
        output_path = args.output
    else:
        from datetime import datetime
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        output_path = f"generated_{timestamp}.jpg"

    # Ensure .jpg extension and save
    if not output_path.lower().endswith(('.jpg', '.jpeg')):
        output_path = Path(output_path).with_suffix('.jpg')

    # Convert to RGB if necessary and save as JPEG
    if image.mode != 'RGB':
        image = image.convert('RGB')

    image.save(output_path, 'JPEG', quality=95)
    print(f"Image saved to: {output_path}")

    # Build metadata with generation parameters
    from datetime import datetime
    final_metadata = {
        'generation_params': {
            'prompt': args.prompt,
            'width': args.width,
            'height': args.height,
            'steps': args.steps,
            'seed': actual_seed,
            'strength': args.strength if input_image else None,
            'model': 'Tongyi-MAI/Z-Image-Turbo'
        },
        'generated_at': datetime.now().isoformat()
    }

    # If regenerating, preserve original metadata
    if hasattr(args, '_original_metadata'):
        for key, value in args._original_metadata.items():
            if key not in final_metadata:
                final_metadata[key] = value

    # Merge additional metadata if provided
    if args.metadata:
        try:
            additional = json.loads(args.metadata)
            for key, value in additional.items():
                if key not in final_metadata:
                    final_metadata[key] = value
        except json.JSONDecodeError as e:
            print(f"Warning: Could not parse --metadata JSON: {e}", file=sys.stderr)

    # Embed metadata
    metadata_json = json.dumps(final_metadata)
    if embed_metadata_in_jpeg(str(output_path), metadata_json):
        print("Metadata embedded in image")

if __name__ == '__main__':
    main()
