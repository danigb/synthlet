#!/bin/bash

# scripts/_worklet.ts goes to every package: it is the module contract, and
# every package needs it. scripts/_gate.ts and scripts/_blep.ts go only to the
# packages that already carry a copy - the ones that produce or consume a gate,
# and the ones that band-limit a discontinuity - so adding a package does not
# silently give it an unused file.
SOURCE_FILE="scripts/_worklet.ts"
GATE_FILE="scripts/_gate.ts"
BLEP_FILE="scripts/_blep.ts"

# Define the target directory for each package
TARGET_DIR="src/"

# Loop through each directory in the packages/ directory
for PACKAGE in packages/*; do
  # Check if it's a directory
  if [ -d "$PACKAGE" ]; then
    # Define the target path
    TARGET_PATH="$PACKAGE/$TARGET_DIR"

    # Check if the target directory exists
    if [ -d "$TARGET_PATH" ]; then
      # Copy the source file to the target directory
      cp "$SOURCE_FILE" "$TARGET_PATH"
      echo "Copied $SOURCE_FILE to $TARGET_PATH"

      # And the gate contract, but only where it is already used.
      if [ -f "$TARGET_PATH/_gate.ts" ]; then
        cp "$GATE_FILE" "$TARGET_PATH"
        echo "Copied $GATE_FILE to $TARGET_PATH"
      fi

      # And the band-limiting kernels, under the same rule.
      if [ -f "$TARGET_PATH/_blep.ts" ]; then
        cp "$BLEP_FILE" "$TARGET_PATH"
        echo "Copied $BLEP_FILE to $TARGET_PATH"
      fi
    else
      echo "Warning: $TARGET_PATH does not exist. Skipping."
    fi
  fi
done
