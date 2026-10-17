# Lunavo PostgreSQL backup and restore operations

## What is protected

The self-hosted `postgres-backup` service writes PostgreSQL custom-format dumps to the separate Docker volume `lunavo_backups`. It starts after PostgreSQL is healthy, makes an initial backup, validates each dump with `pg_restore --list`, and then repeats on the configured interval. Failed dumps are deleted and retried after five minutes. The default retention is 14 days.

Backups contain customer, order, account, and financial records. Treat the backup volume as sensitive production data. Access to a Docker host or to the backup container is effectively privileged access to those records.

**A backup on the same host is not disaster recovery.** Disk failure, host loss, ransomware, or accidental removal of Docker volumes can destroy both the database and its local backups. Before accepting live orders, configure and periodically verify an encrypted copy on an independent system that you control, with access limited to authorized operators. Keep encryption keys separate from the backup copy. Lunavo does not silently upload production data to a hosted storage provider.

## Configure and start

Optional values in `.env`:

- `LUNAVO_BACKUP_RETENTION_DAYS=14` — keep local dump files for at least one day; older dumps are removed during a successful backup.
- `LUNAVO_BACKUP_INTERVAL_SECONDS=86400` — interval between successful backups; minimum 60 seconds.

The backup service uses the existing PostgreSQL credentials; no additional provider or API key is required.

Start or rebuild it with the normal stack:

```sh
docker compose up -d --build postgres postgres-backup
docker compose ps postgres postgres-backup
docker compose logs --tail=100 postgres-backup
```

A successful log entry names the resulting `lunavo-YYYYMMDDTHHMMSSZ.dump` archive. Check the logs for recurring errors rather than treating a running container as proof that a fresh backup exists.

List available dumps:

```sh
docker compose exec postgres-backup sh -lc 'ls -lh /backups/lunavo-*.dump'
```

Validate an existing archive without changing the live database (replace the example filename with one shown by the previous command):

```sh
docker compose exec postgres-backup pg_restore --list /backups/lunavo-20261017T120000Z.dump
```

## Perform a non-destructive restore drill

Run a restore drill on a schedule and after significant schema or deployment changes. It restores a selected dump into a new, separate database and leaves the production database unchanged.

1. Confirm that `lunavo_restore_check` does not already exist. Do not drop a database unless you have verified its name and purpose.
2. Create the scratch database:

   ```sh
   docker compose exec postgres-backup createdb -h postgres -U lunavo lunavo_restore_check
   ```

3. Restore the chosen archive into the scratch database (the application is not pointed at this database):

   ```sh
   docker compose exec postgres-backup pg_restore -h postgres -U lunavo -d lunavo_restore_check --no-owner --no-privileges /backups/lunavo-20261017T120000Z.dump
   ```

4. Confirm the expected schema and record counts for tables suitable for a controlled restore test. Avoid printing real customer data into shared logs:

   ```sh
   docker compose exec postgres psql -U lunavo -d lunavo_restore_check -c '\dt'
   ```

5. After verifying the drill, remove only the scratch database you created:

   ```sh
   docker compose exec postgres-backup dropdb -h postgres -U lunavo lunavo_restore_check
   ```

If restore fails, preserve the failed dump and logs for investigation, correct the underlying issue, and repeat the drill with a known-good archive. Do not overwrite or drop the live `lunavo` database as part of a routine drill.

## Recovery and launch checks

Before a production launch, record who is responsible for backups, where independent encrypted copies are kept, how encryption keys are recovered, the required recovery-point objective (acceptable data loss), and the recovery-time objective (acceptable outage). A successful archive check is not a replacement for a tested restore.

After a real restore, pause incoming writes and payment processing until database consistency has been checked. Reconcile pending/settled Flutterwave transactions against the provider, review queued domain events and scheduled workers, and check order, inventory, refund, subscription, and ledger consistency before reopening commerce.
