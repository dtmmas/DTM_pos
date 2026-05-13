# Tasks
- [x] Task 1: Confirmar el estado operativo previo del VPS
  - [x] Validado por el usuario: `farmesperanza-api` esta en `4005`, `farmangelitos-api` en `4004` y `dtmpos-api` en `4003`
  - [x] Validado por el usuario: los cuatro hostnames responden `ok` en `/.well-known/acme-challenge/test.txt`

- [x] Task 2: Guia exacta de emision de certificados con webroot preparada para el operador
  - [x] Documentado el comando exacto para emitir `farmesperanza.com` y `www.farmesperanza.com` con `certbot certonly --webroot -w /var/www/_letsencrypt`
  - [x] Documentado el comando exacto para emitir `farmaciamisangelitos.com` y `www.farmaciamisangelitos.com` con `certbot certonly --webroot -w /var/www/_letsencrypt`
  - [x] Documentada la verificacion posterior esperada en `/etc/letsencrypt/live/farmesperanza.com/` y `/etc/letsencrypt/live/farmaciamisangelitos.com/`

- [x] Task 3: Guia exacta de configuracion HTTPS en Nginx preparada para el operador
  - [x] Documentado el reemplazo del sitio `farmesperanza` con bloque HTTP para challenge/redireccion y bloque HTTPS usando el certificado emitido
  - [x] Documentado el reemplazo del sitio `farmangelitos` con bloque HTTP para challenge/redireccion y bloque HTTPS usando el certificado emitido
  - [x] Documentados los comandos finales `nginx -t` y `systemctl reload nginx`

- [x] Task 4: Guia exacta de validacion final por HTTPS preparada para el operador
  - [x] Documentada la prueba manual `curl -I https://farmesperanza.com`
  - [x] Documentada la prueba manual `curl -I https://www.farmesperanza.com`
  - [x] Documentada la prueba manual `curl -I https://farmaciamisangelitos.com`
  - [x] Documentada la prueba manual `curl -I https://www.farmaciamisangelitos.com`
  - [x] Documentada la verificacion final `certbot renew --dry-run`

# Task Dependencies
- [Task 2] depends on [Task 1]
- [Task 3] depends on [Task 2]
- [Task 4] depends on [Task 3]
