# Démo de jsgantt : fichiers statiques (demo/ et src/, sans build) servis par nginx sans privilèges, port 8080.
# La démo charge ses fichiers par « ../src/ » : demo/index.html est servie à la racine (voir deploy/nginx.conf).
FROM nginxinc/nginx-unprivileged:alpine
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --chown=nginx:nginx demo /usr/share/nginx/html/demo
COPY --chown=nginx:nginx src /usr/share/nginx/html/src
EXPOSE 8080
