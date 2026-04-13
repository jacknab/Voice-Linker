@echo off
title Male Box Admin - First Time Setup
color 0A

echo.
echo  ================================================
echo    Male Box Admin Console - First Time Setup
echo  ================================================
echo.
echo  This will install all required dependencies.
echo  Please wait, this may take a minute...
echo.

call npm install

if %ERRORLEVEL% NEQ 0 (
    color 0C
    echo.
    echo  ERROR: Setup failed. Make sure Node.js is installed.
    echo  Download Node.js from: https://nodejs.org
    echo.
    pause
    exit /b 1
)

echo.
echo  ================================================
echo    Setup complete! 
echo.
echo    Run admin_start.bat to launch the admin panel.
echo  ================================================
echo.
pause
