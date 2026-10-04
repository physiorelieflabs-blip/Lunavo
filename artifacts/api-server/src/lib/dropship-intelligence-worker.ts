import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { trackingGap } from "./dropship-intelligence-core";
import { logger } from "./logger";

export async function scanAllDropshipTrackingGaps(limit=500): Promise<number> {
  const rows=(await db.execute(sql`
    SELECT fj.merchant_id,fj.order_id,o.order_number,fj.status,
           COALESCE(t.last_recorded_at,fj.updated_at) AS last_recorded_at,
           t.expected_delivery_at
    FROM fulfillment_jobs fj
    JOIN orders o ON o.id=fj.order_id AND o.merchant_id=fj.merchant_id
    LEFT JOIN dropship_tracking_checkpoints t
      ON t.merchant_id=fj.merchant_id AND t.order_id=fj.order_id
    JOIN merchants m ON m.id=fj.merchant_id AND m.status='active'
    WHERE fj.status IN ('shipped','in_transit')
    ORDER BY COALESCE(t.last_recorded_at,fj.updated_at) ASC
    LIMIT ${Math.max(1,Math.min(limit,2000))}
  `)).rows as Array<Record<string,unknown>>;
  let alerts=0;
  for(const row of rows){
    const gap=trackingGap({status:String(row.status),lastRecordedAt:row.last_recorded_at as string|Date});
    if(!["warning","critical"].includes(gap.state))continue;
    const severity=gap.state==="critical"?"critical":"high";
    const fingerprint="tracking-gap:"+String(row.order_id)+":"+gap.state;
    await db.execute(sql`
      INSERT INTO dropship_alerts
        (merchant_id,kind,severity,entity_type,entity_id,title,message,fingerprint,evidence)
      VALUES
        (${Number(row.merchant_id)},'tracking_gap',${severity},'order',${String(row.order_id)},
         ${gap.state==="critical"?"Critical tracking silence":"Tracking silence"},
         ${gap.message},${fingerprint},
         ${JSON.stringify({orderNumber:row.order_number,gapHours:gap.gapHours,lastRecordedAt:row.last_recorded_at,expectedDeliveryAt:row.expected_delivery_at})}::jsonb)
      ON CONFLICT (merchant_id,fingerprint) DO UPDATE SET
        severity=EXCLUDED.severity,message=EXCLUDED.message,evidence=EXCLUDED.evidence,
        status='open',updated_at=now()
    `);
    alerts++;
  }
  return alerts;
}

export function startDropshipIntelligenceWorker(intervalMs=15*60_000){
  const timer=setInterval(()=>{void scanAllDropshipTrackingGaps().catch(err=>logger.error({err},"Dropship tracking intelligence scan failed"));},Math.max(60_000,intervalMs));
  timer.unref();
  return ()=>clearInterval(timer);
}
