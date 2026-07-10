      <AdjustableTable
        title="PS Tier Client"
        subtitle="Tier ini menentukan berapa persen profit client yang menjadi PS fee."
        storageKey="ts_ps_tier_table"
        columns={psTierColumns}
        rows={data?.tiers || []}
        loading={loading}
        emptyText="Belum ada PS tier."
      />

      <section style={styles.section}>
        <h3 style={styles.sectionTitle}>TS Share / Master Pool</h3>

        <p style={styles.sectionSub}>
          PS fee client dibagi menjadi bagian TS dan Master Pool. Client net tidak
          boleh berkurang di luar PS fee.
        </p>

        <div style={styles.grid}>
          <div style={styles.card}>
            <div style={styles.label}>TS Share</div>
            <div style={styles.value}>
              {formatPercent(activeSplit?.ts_share_rate)}
            </div>
          </div>

          <div style={styles.card}>
            <div style={styles.label}>Master Pool</div>
            <div style={styles.value}>
              {formatPercent(activeSplit?.master_pool_rate)}
            </div>
          </div>

          <div style={styles.card}>
            <div style={styles.label}>Effective From</div>
            <div style={{ color: '#f8fafc', fontWeight: 800 }}>
              {formatDate(activeSplit?.effective_from)}
            </div>
          </div>
        </div>
      </section>

      <AdjustableTable
        title="Distribution Weight"
        subtitle="Bobot ini membagi Master Pool ke upline. Angka 4 / 2.5 / 1.5 / 1 / 0.5 adalah bobot pool, bukan potongan tambahan dari profit client."
        storageKey="ts_distribution_weight_table"
        columns={distributionColumns}
        rows={data?.distribution_items || []}
        loading={loading}
        emptyText="Belum ada distribution item."
      />

      <section style={styles.section}>
        <h3 style={styles.sectionTitle}>Distribution Rule</h3>

        <p style={styles.sectionSub}>
          Rule aktif yang dipakai untuk menghitung pembagian Master Pool.
        </p>

        <div style={styles.grid}>
          <div style={styles.card}>
            <div style={styles.label}>Rule Name</div>
            <div style={{ color: '#f8fafc', fontWeight: 900 }}>
              {activeRule?.rule_name || '-'}
            </div>
          </div>

          <div style={styles.card}>
            <div style={styles.label}>Rule Code</div>
            <div style={{ color: '#f8fafc', fontWeight: 900 }}>
              {activeRule?.rule_code || '-'}
            </div>
          </div>

          <div style={styles.card}>
            <div style={styles.label}>Status</div>
            <div style={{ color: '#f8fafc', fontWeight: 900 }}>
              {activeRule?.is_active ? 'Aktif' : 'Nonaktif'}
            </div>
          </div>
        </div>
      </section>

      <AdjustableTable
        title="Client PS Setting"
        subtitle="Setting PS per client. Perubahan jangan langsung edit data aktif, gunakan form Request Change di atas."
        storageKey="ts_client_ps_setting_table"
        columns={clientSettingColumns}
        rows={data?.client_settings || []}
        loading={loading}
        emptyText="Belum ada client PS setting."
      />

      <AdjustableTable
        title="FX Snapshot"
        subtitle="Snapshot rate USD/IDR untuk penguncian nilai invoice. Sekarang masih kosong, nanti terisi saat calculation/invoice PS berjalan."
        storageKey="ts_fx_snapshot_table"
        columns={fxColumns}
        rows={data?.fx_snapshots || []}
        loading={loading}
        emptyText="Belum ada FX snapshot."
      />
