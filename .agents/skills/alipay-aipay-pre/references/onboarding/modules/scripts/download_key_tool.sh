#!/bin/bash
# Preview compatibility entry: only show manual installation instructions.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec node "$SCRIPT_DIR/../../../normal/scripts/runtime.mjs" key-tool "$@"
