#!/bin/sh

# Usage: ./install.sh SCRIPT_NAME [INSTALL_PATH]
#
# SCRIPT_NAME: the name of the script to install (without the .js extension)
# INSTALL_PATH (optional): the installation path (default: /usr/local/bin)
SCRIPT_FOLDER="$(pwd)/$1"
SCRIPT="$SCRIPT_FOLDER/$1.js"
if [ -z "$1" ]; then
    echo "Usage: ./install-script.sh SCRIPT_NAME [INSTALL_PATH]"
    exit 1
fi

if [ ! -f "$SCRIPT" ]; then
    echo "Error: script file not found: $SCRIPT"
    exit 1
fi

if [ -z "$2" ]; then
    INSTALL_PATH="/usr/local/bin"
else
    INSTALL_PATH="$2"
fi

if [ ! -d "$INSTALL_PATH" ]; then
    echo "Creating installation directory: $INSTALL_PATH"
    mkdir -p "$INSTALL_PATH"
fi

if [ ! -d "$SCRIPT_FOLDER/node_modules" ]; then
    echo "Installing dependencies..."
    #need to change dir to the script's dir ($(pwd)/$1)
    cd "$1"
    npm install
    #change back to the original dir
    cd -
fi

# Add permissions to the script
chmod +x "$SCRIPT"

#check if the script is already installed
if [ -f "$INSTALL_PATH/$1" ]; then
    echo "Script already installed: $1"
    exit 0
fi

echo "Installing script: $1 to $INSTALL_PATH"
# Make link to the script
ln -s "$SCRIPT" "$INSTALL_PATH/$1"

echo "Done!" 
