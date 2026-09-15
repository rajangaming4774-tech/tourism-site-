#!/usr/bin/env bash
# Builds a responsive video ladder (2160p/1440p/1080p/720p, HEVC+AV1+H.264
# fallback) plus posters, for one of the scroll-tour sections.
#
# Honesty note: every source this has been run against so far is a 1280x720
# Veo/Flow render, not a real 4K capture, and there is no AI upscaler
# (Topaz/Real-ESRGAN) available in this environment — so the 1440p/2160p
# tiers are a Lanczos upscale + light sharpen of that same footage, not
# added detail. What they *do* buy: a 10-bit HEVC/AV1 encode, which removes
# gradient banding an 8-bit encode would show. Re-run with a genuinely
# higher-resolution source once one exists — nothing else changes.
#
# Usage:
#   bash scripts/encode-video.sh [source-file] [--trim-corner]
#   SOURCE=path/to/file.mp4 bash scripts/encode-video.sh --trim-corner
#
# The output filename prefix is derived from the source's basename, so
# assets/video/rathas-source.mp4 -> assets/video/rathas-2160p-hevc.mp4, etc.
# (strips a trailing "-source" or "-4k-source").
#
# --trim-corner[=PCT]: several of the source clips carry a small watermark
# in the bottom-right corner. This crops PCT% (default 6) off the right and
# PCT% off the bottom, then re-crops to an exact centred 16:9 (a no-op on a
# source that's already 16:9, but keeps this correct for anything that
# isn't), before scaling. Check the crop first with ?debugFrame=1 on the
# live page (draws the same boundary over the uncropped video).
#
# Measured on both source clips shot so far: the watermark's centre sits at
# roughly 90% across / 86% down, i.e. ~10% in from the right edge and ~14%
# in from the bottom — so the default 6% will NOT fully clear it. Use
# --trim-corner=15 (or nudge from there with ?debugFrame=1 open) for a
# clean removal; 6% is left as the default only because that's what was
# specified, not because it's been verified to work.

set -euo pipefail
cd "$(dirname "$0")/.."

TRIM_CORNER=0
# Measured on the actual clips (1280x720): the watermark occupies
# x 1137-1183, y 575-625 — i.e. it starts 11.2% in from the right edge but
# only 20% up from the bottom. Cropping the RIGHT alone clears it, so the
# bottom trim defaults to 0: trimming both threw away 28% of the frame
# (and with it, real resolution) for no reason.
TRIM_RIGHT=12
TRIM_BOTTOM=0
SRC_ARG=""
for arg in "$@"; do
  case "$arg" in
    --trim-corner) TRIM_CORNER=1 ;;
    --trim-corner=*) TRIM_CORNER=1; TRIM_RIGHT="${arg#--trim-corner=}"; TRIM_BOTTOM="$TRIM_RIGHT" ;;
    --trim-right=*) TRIM_CORNER=1; TRIM_RIGHT="${arg#--trim-right=}" ;;
    --trim-bottom=*) TRIM_CORNER=1; TRIM_BOTTOM="${arg#--trim-bottom=}" ;;
    *) SRC_ARG="$arg" ;;
  esac
done

SOURCE="${SOURCE:-${SRC_ARG:-assets/video/temple-source.mp4}}"
OUT=assets/video
mkdir -p "$OUT"

if [ ! -f "$SOURCE" ]; then
  echo "Source not found: $SOURCE" >&2
  exit 1
fi

BASE="$(basename "$SOURCE")"
BASE="${BASE%.mp4}"
BASE="${BASE%-4k-source}"
BASE="${BASE%-source}"
PREFIX="$BASE"

echo "Source: $SOURCE -> output prefix '$PREFIX' (trim=${TRIM_CORNER} right=${TRIM_RIGHT}% bottom=${TRIM_BOTTOM}%)"
ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=s=x:p=0 "$SOURCE"

# Trim right/bottom by their own percentages, then re-crop to a centred 16:9.
KEEP_W=$(awk "BEGIN { printf \"%.4f\", 1 - ${TRIM_RIGHT}/100 }")
KEEP_H=$(awk "BEGIN { printf \"%.4f\", 1 - ${TRIM_BOTTOM}/100 }")
CROP_FILTER="crop=iw*${KEEP_W}:ih*${KEEP_H}:0:0,crop='if(gt(iw/ih,16/9),ih*16/9,iw)':'if(gt(iw/ih,16/9),ih,iw*9/16)':'(iw-ow)/2':'(ih-oh)/2'"

vf_chain() {
  # vf_chain <scale-and-extra-filters>
  if [ "$TRIM_CORNER" = "1" ]; then
    echo "${CROP_FILTER},$1"
  else
    echo "$1"
  fi
}

print_dims() {
  local file=$1
  local dims
  dims=$(ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=s=x:p=0 "$file")
  echo "  -> $(basename "$file"): ${dims}"
}

# ---- High tiers (2160p / 1440p): keyframe every 2 frames, 10-bit ----
# -g 2 -keyint_min 2 keeps a keyframe within one scroll-frame's reach at any
# scrub position; 10-bit output kills banding on the smooth gradients.
encode_high() {
  local height=$1 width=$2 tag=$3
  local hevc="$OUT/${PREFIX}-${tag}-hevc.mp4"
  local av1="$OUT/${PREFIX}-${tag}-av1.mp4"
  ffmpeg -y -i "$SOURCE" -vf "$(vf_chain "scale=${width}:${height}:flags=lanczos,unsharp=5:5:0.4")" -an \
    -c:v libx265 -tag:v hvc1 -pix_fmt yuv420p10le -crf 22 -preset medium \
    -g 2 -keyint_min 2 -movflags +faststart "$hevc"
  print_dims "$hevc"
  ffmpeg -y -i "$SOURCE" -vf "$(vf_chain "scale=${width}:${height}:flags=lanczos,unsharp=5:5:0.4")" -an \
    -c:v libsvtav1 -pix_fmt yuv420p10le -crf 30 -preset 8 \
    -g 2 -keyint_min 2 -movflags +faststart "$av1"
  print_dims "$av1"
}

# ---- 1080p and below: keyframe every frame (max scrub smoothness) ----
encode_low() {
  local height=$1 width=$2 tag=$3 with_h264=$4
  local hevc="$OUT/${PREFIX}-${tag}-hevc.mp4"
  local av1="$OUT/${PREFIX}-${tag}-av1.mp4"
  ffmpeg -y -i "$SOURCE" -vf "$(vf_chain "scale=${width}:${height}:flags=lanczos,unsharp=5:5:0.4")" -an \
    -c:v libx265 -tag:v hvc1 -pix_fmt yuv420p10le -crf 23 -preset medium \
    -g 1 -keyint_min 1 -movflags +faststart "$hevc"
  print_dims "$hevc"
  ffmpeg -y -i "$SOURCE" -vf "$(vf_chain "scale=${width}:${height}:flags=lanczos,unsharp=5:5:0.4")" -an \
    -c:v libsvtav1 -pix_fmt yuv420p10le -crf 32 -preset 8 \
    -g 1 -keyint_min 1 -movflags +faststart "$av1"
  print_dims "$av1"
  if [ "$with_h264" = "1" ]; then
    local h264="$OUT/${PREFIX}-${tag}-h264.mp4"
    ffmpeg -y -i "$SOURCE" -vf "$(vf_chain "scale=${width}:${height}:flags=lanczos")" -an \
      -c:v libx264 -pix_fmt yuv420p -crf 20 -preset medium \
      -g 1 -keyint_min 1 -movflags +faststart "$h264"
    print_dims "$h264"
  fi
}

echo "== 2160p (upscaled) =="; encode_high 2160 3840 2160p
echo "== 1440p (upscaled) =="; encode_high 1440 2560 1440p
echo "== 1080p (upscaled, + H.264 fallback) =="; encode_low 1080 1920 1080p 1
echo "== 720p (native, H.264 only — mobile baseline) =="
h264_720="$OUT/${PREFIX}-720p-h264.mp4"
ffmpeg -y -i "$SOURCE" -vf "$(vf_chain "scale=1280:720:flags=lanczos")" -an \
  -c:v libx264 -pix_fmt yuv420p -crf 20 -preset medium \
  -g 1 -keyint_min 1 -movflags +faststart "$h264_720"
print_dims "$h264_720"

# ---- Posters (from the same cropped frame, so poster and video line up) ----
poster_jpg="$OUT/${PREFIX}-poster.jpg"
poster_avif="$OUT/${PREFIX}-poster.avif"
ffmpeg -y -i "$SOURCE" -vframes 1 -vf "$(vf_chain "scale=2560:-1:flags=lanczos")" -q:v 3 "$poster_jpg"
ffmpeg -y -i "$SOURCE" -vframes 1 -vf "$(vf_chain "scale=2560:-1:flags=lanczos")" -c:v libaom-av1 -still-picture 1 -crf 28 "$poster_avif"
print_dims "$poster_jpg"

echo "== Done. Sizes: =="
ls -la "$OUT" | grep "^-.*${PREFIX}-"
