@echo off
title GitMultiClone - High-Speed Batch Cloner
cd /d "%~dp0"

echo ===================================================================
echo             GitMultiClone / Cong Cu Clone GitHub Da Luong
echo ===================================================================
echo.
echo  * Dang khoi chay may chu noi bo tren cong 3456...
echo  * Trinh duyet web se tu dong bat len ngay lap tuc!
echo.

start "" http://localhost:3456
node server.js
pause
