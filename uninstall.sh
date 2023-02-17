#!/bin/sh

# Usage: ./uninstall.sh SCRIPT_NAME [INSTALL_PATH]
#
# SCRIPT_NAME: the name of the script to install (without the .js extension)
# INSTALL_PATH (optional): the installation path (default: /usr/local/bin)
SCRIPT_FOLDER="$(pwd)/$1"
SCRIPT="$SCRIPT_FOLDER/$1.js"

if [ -z "$1" ]; then
    echo "Usage: ./uninstall.sh SCRIPT_NAME [INSTALL_PATH]"
    exit 1
fi

if [ -z "$2" ]; then
    INSTALL_PATH="/usr/local/bin"
else
    INSTALL_PATH="$2"
fi

if [ ! -d "$INSTALL_PATH" ]; then
    echo "Error: installation directory not found: $INSTALL_PATH"
    exit 1
fi

echo "Uninstalling script: $1 from $INSTALL_PATH"
#remove link to the script
rm "$INSTALL_PATH/$1"

echo "Done!"