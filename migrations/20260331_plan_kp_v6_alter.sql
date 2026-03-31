USE `plan_kp`;

SET FOREIGN_KEY_CHECKS = 0;

-- 1) Tambah kolom target jadwal (idempotent)
ALTER TABLE `plan_jadwal`
    ADD COLUMN IF NOT EXISTS `jdw_target` INT NOT NULL DEFAULT 1 AFTER `jdw_tahun`;

-- 2) Normalisasi nilai target lama (jaga agar tidak 0/negatif)
UPDATE `plan_jadwal`
SET `jdw_target` = 1
WHERE `jdw_target` IS NULL OR `jdw_target` < 1;

-- 3) Seed nilai awal target dari jumlah unit aktif per jenis (hanya jika masih default 1)
UPDATE `plan_jadwal` j
LEFT JOIN (
    SELECT i.inv_jenis_id, COUNT(*) AS total_unit
    FROM `plan_inventaris` i
    WHERE i.inv_is_active = 1
    GROUP BY i.inv_jenis_id
) x ON x.inv_jenis_id = j.jdw_jenis_id
SET j.jdw_target = GREATEST(1, COALESCE(x.total_unit, 1))
WHERE j.jdw_target = 1;

-- 4) Normalisasi status realisasi lama sebelum ubah ENUM
UPDATE `plan_realisasi`
SET `real_status` = 'Draft'
WHERE `real_status` IN ('Menunggu Approval', 'Ditolak');

-- 5) Sederhanakan enum status realisasi
ALTER TABLE `plan_realisasi`
    MODIFY COLUMN `real_status` ENUM('Draft','Selesai') NOT NULL DEFAULT 'Draft';

-- 6) Cegah duplikasi mesin yang sama dalam satu jadwal (idempotent)
SET @idx_exists := (
    SELECT COUNT(1)
    FROM INFORMATION_SCHEMA.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'plan_realisasi'
      AND INDEX_NAME = 'uq_real_jadwal_inv'
);
SET @sql_add_idx := IF(
    @idx_exists = 0,
    'ALTER TABLE `plan_realisasi` ADD UNIQUE INDEX `uq_real_jadwal_inv` (`real_jadwal_id`, `real_inv_id`);',
    'SELECT ''Index uq_real_jadwal_inv already exists'';'
);
PREPARE stmt FROM @sql_add_idx;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET FOREIGN_KEY_CHECKS = 1;
