#!/bin/bash
# postprocess.sh — per-scene webm post-processing recipes (battle-tested values).
# Pick the functions you need. Requires ffmpeg + ffprobe on PATH.
# Works on macOS/Linux and on Windows via WSL or Git Bash.
#   Usage: source postprocess.sh
#          speedup in.webm out.mp4 12.3 40.1 9    # speed up ONLY the 12.3–40.1s window by 9x
#          montage out.mp4 check.png              # 3x3 contact sheet (mandatory eyeball check)
#          duration out.mp4
#          concat_all "e0.mp4 e1.mp4 e2.mp4" final.mp4
#          spotcheck final.mp4 "5 60 130 190"     # pull frames at given timestamps
set -u

# Speed up ONLY the dead-air window: [0,A) real | [A,B) Nx | [B,end) real  -> 30fps H.264 mp4
speedup() { # in out A B factor
  local in="$1" out="$2" A="$3" B="$4" f="${5:-9}"
  ffmpeg -y -i "$in" -filter_complex "
[0:v]trim=0:${A},setpts=PTS-STARTPTS[v1];
[0:v]trim=${A}:${B},setpts=(PTS-STARTPTS)/${f}[v2];
[0:v]trim=${B},setpts=PTS-STARTPTS[v3];
[v1][v2][v3]concat=n=3:v=1[v]" -map "[v]" -r 30 -c:v libx264 -pix_fmt yuv420p "$out"
}

# No speed-up needed: just webm -> mp4
tomp4() { ffmpeg -y -i "$1" -r 30 -c:v libx264 -pix_fmt yuv420p "$2"; }

# Contact sheet for eyeball QA (only way to catch subtitle overlap / wrong zoom) — run EVERY render
montage() { # in out [interval_sec]
  ffmpeg -y -i "$1" -vf "fps=1/${3:-2.5},scale=600:-1,tile=3x3" -frames:v 1 "$2"
}

duration() { ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 "$1"; }

# Concatenate scene mp4s in order, no re-encode
concat_all() { # "file1 file2 ..." out
  local list; list=$(mktemp)
  for f in $1; do printf "file '%s'\n" "$(realpath "$f")" >> "$list"; done
  ffmpeg -y -f concat -safe 0 -i "$list" -c copy "$2"
  rm -f "$list"
}

# Spot-check the montage: pull frames at given timestamps (eyeball scene cuts / subtitle consistency)
spotcheck() { # in "t1 t2 t3 ..."
  local i=0
  for t in $2; do ffmpeg -y -ss "$t" -i "$1" -frames:v 1 "spot_${i}.png" 2>/dev/null; i=$((i+1)); done
  echo "spot_*.png created — open and inspect"
}
