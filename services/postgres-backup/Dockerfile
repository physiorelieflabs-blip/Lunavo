FROM postgres:17-alpine

ENV BACKUP_DIR=/backups
RUN mkdir -p /backups && chown postgres:postgres /backups
COPY backup.sh /usr/local/bin/lunavo-postgres-backup
RUN chmod 0755 /usr/local/bin/lunavo-postgres-backup

USER postgres
ENTRYPOINT ["/usr/local/bin/lunavo-postgres-backup"]
