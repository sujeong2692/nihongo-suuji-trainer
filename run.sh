#!/usr/bin/env bash
# Compile and run the Nihongo Suuji Trainer (requires JDK 17+ on PATH).
# Usage: ./run.sh [port] | ./run.sh --jar
set -euo pipefail
cd "$(dirname "$0")"
command -v javac >/dev/null || { echo "javac not found. Install a JDK 17+." >&2; exit 1; }
rm -rf out
javac -encoding UTF-8 -d out $(find src/main/java -name '*.java')
if [ "${1:-}" = "--jar" ]; then
  jar --create --file suuji-trainer.jar --main-class suuji.Main -C out . -C src/main/resources .
  echo "Built suuji-trainer.jar  ->  java -jar suuji-trainer.jar"
  exit 0
fi
java -cp "out:src/main/resources" suuji.Main --port "${1:-8080}"
