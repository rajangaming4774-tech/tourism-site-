#!/usr/bin/env bash
# Stitches the individual monument clips into one continuous master for the
# combined scroll tour, then (optionally) runs the ladder encode on it.
#
# Clip order and transitions:
#   shore-exterior -> shore-interior   fade      0.4s  (same monument: one move)
#   shore-interior -> arjuna           fadeblack 0.6s  (monument boundary)
#   arjuna         -> rathas           fadeblack 0.6s  (monument boundary)
#
# The rule is "same monument -> soft fade, different monument -> dip to
# black", applied between whichever clips are actually present — so a
# missing clip just closes the gap and the offsets shift accordingly.
# Re-run this after adding one and paste the new CLIP_OFFSETS block.
#
# Usage:
#   bash scripts/stitch-video.sh [--trim-corner[=PCT]] [--trim-right=PCT]
#                                [--trim-bottom=PCT] [--encode]
#
#   --trim-corner   crop the AI-render watermark out of every clip BEFORE
#                   stitching, using the defaults below.
#   --trim-right    default 12%. Measured on the actual 1280x720 clips, the
#   --trim-bottom   watermark occupies x 1137-1183, y 575-625 — it starts
#                   11.2% in from the right but only 20% up from the bottom,
#                   so trimming the RIGHT alone clears it and the bottom
#                   defaults to 0. (Trimming both at 15%, as this first did,
#                   threw away 28% of the frame — and with it real
#                   resolution — for nothing.)
#   --encode        run scripts/encode-video.sh on the finished master
#                   (without a trim, since the crop is already baked in).
#
# The master is written at the clips' own cropped resolution rather than
# upscaled to 4K: the ladder upscales once per tier from here, which beats
# resampling twice. See the honesty note in scripts/encode-video.sh.

set -euo pipefail
cd "$(dirname "$0")/.."

TRIM_CORNER=0
TRIM_RIGHT=12
TRIM_BOTTOM=0
RUN_LADDER=0
for arg in "$@"; do
  case "$arg" in
    --trim-corner) TRIM_CORNER=1 ;;
    --trim-corner=*) TRIM_CORNER=1; TRIM_RIGHT="${arg#--trim-corner=}"; TRIM_BOTTOM="$TRIM_RIGHT" ;;
    --trim-right=*) TRIM_CORNER=1; TRIM_RIGHT="${arg#--trim-right=}" ;;
    --trim-bottom=*) TRIM_CORNER=1; TRIM_BOTTOM="${arg#--trim-bottom=}" ;;
    --encode) RUN_LADDER=1 ;;
    *) echo "Unknown argument: $arg" >&2; exit 1 ;;
  esac
done

SRC=assets/video
OUT="$SRC/mahabalipuram-master.mp4"

# clip basename : monument it belongs to
ALL_CLIPS=(shore-exterior shore-interior arjuna rathas)
ALL_MONUMENTS=(shore shore arjuna rathas)

CLIPS=(); MONUMENTS=()
for i in "${!ALL_CLIPS[@]}"; do
  f="$SRC/${ALL_CLIPS[$i]}.mp4"
  if [ -f "$f" ]; then
    CLIPS+=("${ALL_CLIPS[$i]}")
    MONUMENTS+=("${ALL_MONUMENTS[$i]}")
  else
    echo "!! missing $f — skipping (offsets below reflect the clips that ARE present)" >&2
  fi
done
[ ${#CLIPS[@]} -ge 2 ] || { echo "Need at least two clips to stitch." >&2; exit 1; }

# ---- Probe every clip: duration, size, fps ----
declare -a DUR W H FPS
for i in "${!CLIPS[@]}"; do
  f="$SRC/${CLIPS[$i]}.mp4"
  DUR[$i]=$(ffprobe -v error -select_streams v:0 -show_entries format=duration -of default=nw=1:nk=1 "$f")
  W[$i]=$(ffprobe -v error -select_streams v:0 -show_entries stream=width -of default=nw=1:nk=1 "$f")
  H[$i]=$(ffprobe -v error -select_streams v:0 -show_entries stream=height -of default=nw=1:nk=1 "$f")
  rate=$(ffprobe -v error -select_streams v:0 -show_entries stream=r_frame_rate -of default=nw=1:nk=1 "$f")
  FPS[$i]=$(echo "$rate" | awk -F/ '{ printf "%.0f", ($2 ? $1/$2 : $1) }')
  printf "  %-16s %ss  %sx%s  %sfps\n" "${CLIPS[$i]}" "${DUR[$i]}" "${W[$i]}" "${H[$i]}" "${FPS[$i]}"
done

# ---- Target frame rate: whichever of 24/30 the majority of clips use ----
n24=0; n30=0
for f in "${FPS[@]}"; do
  if [ "$f" -le 26 ]; then n24=$((n24 + 1)); else n30=$((n30 + 1)); fi
done
if [ "$n30" -gt "$n24" ]; then TARGET_FPS=30; else TARGET_FPS=24; fi

# ---- Target frame size: the first clip's size after the crop, forced even ----
KEEP_W=$(awk "BEGIN { printf \"%.4f\", 1 - ${TRIM_CORNER}*${TRIM_RIGHT}/100 }")
KEEP_H=$(awk "BEGIN { printf \"%.4f\", 1 - ${TRIM_CORNER}*${TRIM_BOTTOM}/100 }")
TW=$(awk "BEGIN { w=int(${W[0]} * $KEEP_W / 2) * 2; print w }")
TH=$(awk "BEGIN { h=int(${H[0]} * $KEEP_H / 2) * 2; print h }")
# Re-crop to an exact centred 16:9 so a non-16:9 source can't skew the master.
TH=$(awk "BEGIN { h=int($TW * 9 / 16 / 2) * 2; print (h < $TH ? h : $TH) }")
TW=$(awk "BEGIN { w=int($TH * 16 / 9 / 2) * 2; print (w < $TW ? w : $TW) }")

if [ "$TRIM_CORNER" = "1" ]; then
  CROP="crop=iw*${KEEP_W}:ih*${KEEP_H}:0:0,crop='if(gt(iw/ih,16/9),ih*16/9,iw)':'if(gt(iw/ih,16/9),ih,iw*9/16)':'(iw-ow)/2':'(ih-oh)/2',"
else
  CROP=""
fi

echo "Target: ${TW}x${TH} @ ${TARGET_FPS}fps  (trim=${TRIM_CORNER} right=${TRIM_RIGHT}% bottom=${TRIM_BOTTOM}%)"

# ---- Build the filtergraph ----
INPUTS=(); FILTERS=""
for i in "${!CLIPS[@]}"; do
  INPUTS+=(-i "$SRC/${CLIPS[$i]}.mp4")
  FILTERS+="[${i}:v]${CROP}scale=${TW}:${TH}:flags=lanczos,setsar=1,fps=${TARGET_FPS},format=yuv420p[v${i}];"
done

# Offsets: with xfade, the output runs (sum of durations - sum of transitions),
# and each transition STARTS at (accumulated duration so far - its duration).
declare -a START_OFFSET TRANS_KIND TRANS_DUR
START_OFFSET[0]=0
prev="[v0]"
acc="${DUR[0]}"
for ((i = 1; i < ${#CLIPS[@]}; i++)); do
  if [ "${MONUMENTS[$i]}" = "${MONUMENTS[$((i - 1))]}" ]; then
    kind=fade; dur=0.4
  else
    kind=fadeblack; dur=0.6
  fi
  TRANS_KIND[$i]=$kind; TRANS_DUR[$i]=$dur
  offset=$(awk "BEGIN { printf \"%.3f\", $acc - $dur }")
  # The new clip is fully visible once the transition ends — that's the number
  # the chapter times should be offset by.
  START_OFFSET[$i]=$(awk "BEGIN { printf \"%.3f\", $acc }")
  if [ "$i" -eq $((${#CLIPS[@]} - 1)) ]; then out="[vout]"; else out="[x${i}]"; fi
  FILTERS+="${prev}[v${i}]xfade=transition=${kind}:duration=${dur}:offset=${offset}${out};"
  prev="$out"
  acc=$(awk "BEGIN { printf \"%.3f\", $acc + ${DUR[$i]} - $dur }")
done
FILTERS="${FILTERS%;}"

echo "== Stitching ${#CLIPS[@]} clips -> $OUT =="
ffmpeg -y "${INPUTS[@]}" -filter_complex "$FILTERS" -map "[vout]" -an \
  -c:v libx264 -preset medium -crf 16 -pix_fmt yuv420p \
  -colorspace bt709 -color_primaries bt709 -color_trc bt709 \
  -movflags +faststart "$OUT"

FINAL=$(ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 "$OUT")
FINAL_DIMS=$(ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=s=x:p=0 "$OUT")

echo
echo "================ CLIP OFFSETS ================"
echo "master: $OUT  ${FINAL_DIMS}  ${FINAL}s"
for i in "${!CLIPS[@]}"; do
  if [ "$i" -eq 0 ]; then
    printf "  %-16s starts 0.000  (first clip)\n" "${CLIPS[$i]}"
  else
    printf "  %-16s starts %s  (%s %ss ends here)\n" \
      "${CLIPS[$i]}" "${START_OFFSET[$i]}" "${TRANS_KIND[$i]}" "${TRANS_DUR[$i]}"
  fi
done
echo
echo "Paste into content/mahabalipuram-tour.js:"
echo "const CLIP_OFFSETS = {"
for i in "${!CLIPS[@]}"; do
  key=$(echo "${CLIPS[$i]}" | awk -F- '{ printf "%s", $1; for (j=2; j<=NF; j++) printf "%s%s", toupper(substr($j,1,1)), substr($j,2) }')
  printf "  %s: %s,\n" "$key" "${START_OFFSET[$i]}"
done
echo "};"
echo "=============================================="

if [ "$RUN_LADDER" = "1" ]; then
  echo
  echo "== Running the ladder on the master (crop already baked in) =="
  bash scripts/encode-video.sh "$OUT"
fi
