@echo off
rem Abre o site no computador. Feche esta janela para parar.
cd /d "%~dp0"
start "" http://localhost:8000
node tools\servidor-local.mjs
pause
