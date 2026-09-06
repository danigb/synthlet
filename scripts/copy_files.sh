#!/bin/bash

# scripts/_worklet.ts goes to every package: it is the module contract, and
# every package needs it. scripts/_gate.ts, scripts/_blep.ts, scripts/_delay.ts
# and scripts/_spectrum.ts go only to the packages that already carry a copy -
# the ones that produce or consume a gate, the ones that band-limit a
# discontinuity, the ones that need a circular buffer, and the ones whose tests
# measure a spectrum - so adding a package does not silently give it an unused
# file. A package opts in by copying the file once by hand; from then on this
# script keeps it current.
SOURCE_FILE="scripts/_worklet.ts"
GATE_FILE="scripts/_gate.ts"
BLEP_FILE="scripts/_blep.ts"
DELAY_FILE="scripts/_delay.ts"
SPECTRUM_FILE="scripts/_spectrum.ts"

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

      # And the delay line, under the same rule.
      if [ -f "$TARGET_PATH/_delay.ts" ]; then
        cp "$DELAY_FILE" "$TARGET_PATH"
        echo "Copied $DELAY_FILE to $TARGET_PATH"
      fi

      # And the measuring instrument, under the same rule. It is test-only:
      # no index.ts imports it, so it never reaches a published bundle.
      if [ -f "$TARGET_PATH/_spectrum.ts" ]; then
        cp "$SPECTRUM_FILE" "$TARGET_PATH"
        echo "Copied $SPECTRUM_FILE to $TARGET_PATH"
      fi
    else
      echo "Warning: $TARGET_PATH does not exist. Skipping."
    fi
  fi
done
