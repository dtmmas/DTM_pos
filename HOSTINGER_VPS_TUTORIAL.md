# Tutorial Hostinger VPS

Guia completa para desplegar `DTMPos` en un VPS Hostinger desde cero, sin afectar otra aplicacion ya activa en el servidor.

## Datos de este despliegue

- Dominio: `cesperanza.sistemasdtm.com`
- Carpeta del proyecto: `/var/www/dtmpos`
- Backend Node.js: `127.0.0.1:4003`
- Proceso PM2: `dtmpos-api`
- App existente en el VPS: `tickets-dtm`

## Objetivo

Levantar `DTMPos` en el VPS como una aplicacion separada, con:

- frontend compilado en `client/dist`
- backend Node.js con PM2
- MySQL como base de datos
- Nginx publicando la web y haciendo proxy a `/api` y `/uploads`

## 1. Conectarse al VPS

```bash
ssh root@TU_IP
```

## 2. Revisar estado actual del VPS

Esto sirve para confirmar que la app anterior sigue intacta.

```bash
pm2 list
ss -tulpn | grep LISTEN
ls /etc/nginx/sites-available
ls /etc/nginx/sites-enabled
nginx -t
```

## 3. Instalar dependencias base

```bash
apt update
apt install -y nginx mysql-server unzip
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs
npm install -g pm2
```

Verificar versiones:

```bash
node -v
npm -v
mysql --version
nginx -v
pm2 -v
```

## 4. Clonar el proyecto

```bash
mkdir -p /var/www
cd /var/www
git clone https://github.com/dtmmas/DTM_pos.git dtmpos
cd /var/www/dtmpos
```

Si ya existe el proyecto:

```bash
cd /var/www/dtmpos
git pull origin main
```

## 5. Instalar dependencias del proyecto

```bash
cd /var/www/dtmpos/client
npm install

cd /var/www/dtmpos/server
npm install
```

## 6. Crear base de datos y usuario MySQL

Entrar como root del sistema:

```bash
sudo mysql
```

Dentro de MySQL ejecutar:

```sql
CREATE DATABASE IF NOT EXISTS dtmpos CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS 'dtm'@'localhost' IDENTIFIED BY 'TU_PASSWORD_REAL';
GRANT ALL PRIVILEGES ON dtmpos.* TO 'dtm'@'localhost';
FLUSH PRIVILEGES;
EXIT;
```

Probar acceso:

```bash
mysql -u dtm -p -D dtmpos -e "SHOW TABLES;"
```

## 7. Configurar variables de entorno

```bash
cd /var/www/dtmpos/server
cp .env.example .env
nano .env
```

Contenido recomendado:

```env
PORT=4003
HOST=0.0.0.0
NODE_ENV=production
TRUST_PROXY=1
CORS_ORIGIN=https://cesperanza.sistemasdtm.com
DEFAULT_ADMIN_EMAIL=admin@local
DEFAULT_ADMIN_PASSWORD=admin123
JWT_SECRET=CAMBIA_ESTE_SECRETO
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=dtm
DB_PASSWORD=TU_PASSWORD_REAL
DB_NAME=dtmpos
```

Notas:

- No uses backticks en `CORS_ORIGIN`
- No uses `root` como `DB_USER` en Node.js
- Usa `127.0.0.1` en vez de `localhost`

## 8. Inicializar toda la base correctamente

Este paso deja lista la base para produccion. Crea y normaliza tablas, columnas, roles, permisos y admin inicial.
No siembra catalogos de negocio por defecto: `unidades`, `marcas`, `proveedores`, `departamentos`, `estanterías` ni `almacenes`.

```bash
cd /var/www/dtmpos/server
npm run bootstrap:prod
```

Salida esperada al final:

```bash
Bootstrap complete for database "dtmpos".
Admin user: admin@local / admin123
```

## 9. Compilar frontend

```bash
cd /var/www/dtmpos/client
npm run build
```

## 10. Levantar backend con PM2

Primer arranque:

```bash
cd /var/www/dtmpos
pm2 start server/ecosystem.config.cjs
pm2 save
pm2 startup
```

Si ya existe el proceso:

```bash
cd /var/www/dtmpos
pm2 restart dtmpos-api --update-env
pm2 save
```

## 11. Verificar backend

Dar unos segundos despues del restart:

```bash
sleep 3
curl http://localhost:4003/api/health
pm2 list
pm2 logs dtmpos-api --lines 50
```

Respuesta esperada:

```json
{"ok":true,"env":"production"}
```

## 12. Configurar Nginx

Crear el archivo del sitio:

```bash
nano /etc/nginx/sites-available/dtmpos
```

Pegar esta configuracion:

```nginx
server {
  listen 80;
  server_name cesperanza.sistemasdtm.com;

  root /var/www/dtmpos/client/dist;
  index index.html;

  client_max_body_size 25M;

  location / {
    try_files $uri $uri/ /index.html;
  }

  location /api/ {
    proxy_pass http://127.0.0.1:4003/api/;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }

  location /uploads/ {
    proxy_pass http://127.0.0.1:4003/uploads/;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

Activar el sitio:

```bash
ln -s /etc/nginx/sites-available/dtmpos /etc/nginx/sites-enabled/dtmpos
nginx -t
systemctl reload nginx
```

## 13. Instalar SSL

```bash
apt install -y certbot python3-certbot-nginx
certbot --nginx -d cesperanza.sistemasdtm.com
```

## 14. Acceder al sistema

Abrir en navegador:

- `https://cesperanza.sistemasdtm.com`

Credenciales iniciales:

- Email: `admin@local`
- Password: `admin123`
- El admin inicial queda sin almacén asignado.
- Después del bootstrap debes crear manualmente los catálogos y al menos un almacén antes de usar POS, inventario, compras o traslados.

## 15. Validaciones despues del login

Comprobar:

- que cargue `Productos`
- que cargue `Unidades`
- que cargue `Usuarios` y `Roles`
- que aparezca `Almacenes`
- que permita crear almacenes

## 16. Actualizar el sistema en el futuro

```bash
cd /var/www/dtmpos
git pull origin main

cd /var/www/dtmpos/server
npm install
npm run bootstrap:prod

cd /var/www/dtmpos/client
npm install
npm run build

cd /var/www/dtmpos
pm2 restart dtmpos-api --update-env
pm2 save

sleep 3
curl http://localhost:4003/api/health
```

## 17. Comandos utiles de diagnostico

Ver procesos:

```bash
pm2 list
```

Ver logs:

```bash
pm2 logs dtmpos-api --lines 100
```

Ver si el puerto escucha:

```bash
ss -tulpn | grep 4003
```

Ver health:

```bash
curl http://localhost:4003/api/health
```

Ver tablas:

```bash
mysql -u dtm -p -D dtmpos -e "SHOW TABLES;"
```

Ver columnas de productos:

```bash
mysql -u dtm -p -D dtmpos -e "SHOW COLUMNS FROM products;"
```

Ver roles:

```bash
mysql -u dtm -p -D dtmpos -e "SELECT id, code, name FROM roles;"
```

Ver permisos:

```bash
mysql -u dtm -p -D dtmpos -e "SELECT COUNT(*) AS total FROM permissions;"
```

Ver usuario admin:

```bash
mysql -u dtm -p -D dtmpos -e "SELECT u.id, u.name, u.email, u.role, u.role_id, u.warehouse_id, r.code AS role_code FROM users u LEFT JOIN roles r ON r.id = u.role_id;"
```

## 18. Errores comunes

### Error: `Access denied for user 'root'@'localhost'`

Causa:

- `.env` apunta a `root`

Solucion:

- usar `DB_USER=dtm`
- usar `DB_PASSWORD` real
- reiniciar con:

```bash
pm2 restart dtmpos-api --update-env
```

### Error: `Unknown database 'dtmpos'`

Causa:

- la base no fue creada

Solucion:

- crearla con `sudo mysql`
- volver a ejecutar `npm run bootstrap:prod`

### Error: `Table 'dtmpos.units' doesn't exist`

Causa:

- base parcialmente inicializada

Solucion:

- ejecutar la ultima version de:

```bash
git pull origin main
cd /var/www/dtmpos/server
npm run bootstrap:prod
```

### Error: `Unknown column 'p.product_type'`

Causa:

- la tabla `products` viene vieja y le faltan columnas modernas

Solucion:

- actualizar repo y correr otra vez:

```bash
cd /var/www/dtmpos
git pull origin main
cd /var/www/dtmpos/server
npm run bootstrap:prod
```

### Error: `curl http://127.0.0.1:4003/api/health` falla justo despues del restart

Causa:

- el proceso aun esta levantando

Solucion:

```bash
pm2 restart dtmpos-api --update-env
sleep 3
curl http://localhost:4003/api/health
```

## 19. Archivos importantes del proyecto

- [README.md](file:///c:/Users/HP/Desktop/PRoyectos%20generados%20con%20ia/proyecto%20trae%202/DTMPos/README.md)
- [bootstrap-production.js](file:///c:/Users/HP/Desktop/PRoyectos%20generados%20con%20ia/proyecto%20trae%202/DTMPos/server/bootstrap-production.js)
- [ecosystem.config.cjs](file:///c:/Users/HP/Desktop/PRoyectos%20generados%20con%20ia/proyecto%20trae%202/DTMPos/server/ecosystem.config.cjs)
- [server.js](file:///c:/Users/HP/Desktop/PRoyectos%20generados%20con%20ia/proyecto%20trae%202/DTMPos/server/server.js)

## 20. Resumen corto

Comando base para dejarlo listo:

```bash
cd /var/www/dtmpos
git pull origin main

cd /var/www/dtmpos/server
npm install
npm run bootstrap:prod

cd /var/www/dtmpos/client
npm install
npm run build

cd /var/www/dtmpos
pm2 restart dtmpos-api --update-env || pm2 start server/ecosystem.config.cjs
pm2 save

sleep 3
curl http://localhost:4003/api/health
nginx -t && systemctl reload nginx
```
