#!/bin/bash

echo "Starting Block Builder Multiplayer Server..."
echo ""
echo "Installing dependencies..."
npm install

echo ""
echo "Starting server on ws://localhost:8080"
echo "Open index.html in your browser to play"
echo ""

node server.js
