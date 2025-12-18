@echo off
echo ========================================
echo    Nebula Proxy - Installation Script
echo ========================================
echo.

echo [1/3] Installing dependencies...
call npm install

echo.
echo [2/3] Checking PostgreSQL...
echo Please ensure PostgreSQL is running and credentials in .env are correct
echo.

echo [3/3] Setup complete!
echo.
echo ========================================
echo    Next Steps:
echo ========================================
echo 1. Edit .env file with your PostgreSQL credentials
echo 2. Create database: createdb nebula_proxy
echo 3. Start server: npm start
echo 4. Access admin panel: http://localhost:3000
echo 5. Default login: admin@example.com / admin123
echo.
echo IMPORTANT: Run as Administrator to bind to ports 80 and 443
echo ========================================
pause
