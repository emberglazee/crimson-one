#!/bin/bash

# Exit immediately if a command exits with a non-zero status
set -e

# Go back to the previous commit
git checkout HEAD~1

# Install dependencies
bun install

# Restart the pm2 process named 'crimson-one'
pm2 restart crimson-one
