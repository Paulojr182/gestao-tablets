@echo off
echo ==============================================================
echo       SISTEMA DE CONTROLE E MONITORAMENTO DE TABLETS ESCOLARES
echo ==============================================================
echo.

echo [1/3] Liberando a porta 3000 no Firewall do Windows...
netsh advfirewall firewall add rule name="Controle Tablets Server" dir=in action=allow protocol=TCP localport=3000

echo.
echo [2/3] Instalando dependencias do Servidor (API/WS)...
cd server
call npm install
cd ..

echo.
echo [3/3] Instalando dependencias do Dashboard Web...
cd dashboard
call npm install
cd ..

echo.
echo ==============================================================
echo INSTALACAO CONCLUIDA COM SUCESSO!
echo ==============================================================
echo.
echo Para executar o servidor, abra um terminal e rode:
echo   cd server
echo   npm start
echo.
echo Para executar o dashboard em modo desenvolvimento:
echo   cd dashboard
echo   npm run dev
echo.
echo O app Android esta localizado na pasta: android-app
echo ==============================================================
pause
