#!/bin/bash

# scripts/_worklet.ts goes to every package: it is the module contract, and
# every package needs it. scripts/_gate.ts, scripts/_blep.ts, scripts/_delay.ts,
# scripts/_spectrum.ts, scripts/_levels.ts, scripts/_smooth.ts,
# scripts/_voices.ts and scripts/_traversal.ts go only to the packages that
# already carry a copy - the ones that produce or consume a gate, the ones that
# band-limit a discontinuity, the ones that need a circular buffer, the ones
# whose tests measure a spectrum, the ones that show the main thread a level,
# the ones that turn a time in seconds into a one-pole coefficient, the ones
# that hand notes to voices, and the ones that walk a sequence of them - so
# adding a package does not silently give it an unused file. A package opts in
# by copying the file once by hand; from then on this script keeps it current.
SOURCE_FILE="scripts/_worklet.ts"
GATE_FILE="scripts/_gate.ts"
BLEP_FILE="scripts/_blep.ts"
DELAY_FILE="scripts/_delay.ts"
SPECTRUM_FILE="scripts/_spectrum.ts"
LEVELS_FILE="scripts/_levels.ts"
SMOOTH_FILE="scripts/_smooth.ts"
VOICES_FILE="scripts/_voices.ts"
TRAVERSAL_FILE="scripts/_traversal.ts"

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

      # And the definition of a time in seconds, under the same rule: the
      # packages that turn one into a one-pole coefficient.
      if [ -f "$TARGET_PATH/_smooth.ts" ]; then
        cp "$SMOOTH_FILE" "$TARGET_PATH"
        echo "Copied $SMOOTH_FILE to $TARGET_PATH"
      fi

      # And the levels transport, under the same rule: the packages that show
      # the main thread a number the audio thread computed, and whose readings
      # one renderer has to be able to draw.
      if [ -f "$TARGET_PATH/_levels.ts" ]; then
        cp "$LEVELS_FILE" "$TARGET_PATH"
        echo "Copied $LEVELS_FILE to $TARGET_PATH"
      fi

      # And the voice allocator and note stack, under the same rule. Today
      # that is @synthlet/instrument alone; a native poly worklet would be the
      # second, running the same file on the audio thread.
      if [ -f "$TARGET_PATH/_voices.ts" ]; then
        cp "$VOICES_FILE" "$TARGET_PATH"
        echo "Copied $VOICES_FILE to $TARGET_PATH"
      fi

      # And the traversal, under the same rule. Two packages arpeggiate: one
      # over a scale it is told, one over the notes a player is holding. They
      # share the index math and nothing else - in particular not the mode
      # enum's spelling at their own surfaces.
      if [ -f "$TARGET_PATH/_traversal.ts" ]; then
        cp "$TRAVERSAL_FILE" "$TARGET_PATH"
        echo "Copied $TRAVERSAL_FILE to $TARGET_PATH"
      fi
    else
      echo "Warning: $TARGET_PATH does not exist. Skipping."
    fi
  fi
done
