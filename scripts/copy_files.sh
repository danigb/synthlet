#!/bin/bash

# Define the source file
SOURCE_FILE="scripts/_worklet.ts"

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
    else
      echo "Warning: $TARGET_PATH does not exist. Skipping."
    fi
  fi
done
