import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();
        if (!user || user.role !== 'admin') {
            return Response.json({ error: 'Доступ запрещён: требуются права администратора' }, { status: 403 });
        }

        const db = base44.asServiceRole.entities;

        // ─── 1. CLIENT ─────────────────────────────────────────────────────────
        const client = await db.Client.create({
            company_name: 'ДонРечФлот',
            contact_person: 'Иванов Александр Петрович',
            phone: '+7 (863) 251-33-92',
            email: 'mail@drf.adship.ru',
            address: '344019, г. Ростов-на-Дону, ул. Советская, д. 63, эт. 5',
            comments: 'Крупнейшая судоходная компания на юге России. Оператор внутреннего флота и судов река-море плавания группы Азово-Донское пароходство.'
        });
        console.log('✅ Клиент создан:', client.id);

        // ─── 2. OIL REFERENCES (20 oils) ──────────────────────────────────────
        // Категории: 'main_engine' (SAE 40, высокий TBN), 'aux_gen' (15W-40),
        //            'hydraulic' (ISO VG 46), 'gearbox_big' (ISO VG 220), 'gearbox_steering' (80W-90)
        const oilData = [
            // === Главные двигатели (SAE 40, TBN ≥ 12) ===
            { key: 'gadinia_s3_40',      cat: 'main_engine',       oil_name: 'Shell Gadinia S3 40',           manufacturer: 'Shell',    oil_category: 'Моторное судовое',          sae_grade: 'SAE 40',     passport_viscosity_40: 118,  passport_viscosity_100: 14.2, passport_viscosity_index: 115, passport_density_15: 880, passport_flash_point: 224, passport_pour_point: -9,  passport_tbn: 30 },
            { key: 'gadinia_al_40',      cat: 'main_engine',       oil_name: 'Shell Gadinia AL 40',           manufacturer: 'Shell',    oil_category: 'Моторное судовое',          sae_grade: 'SAE 40',     passport_viscosity_40: 110,  passport_viscosity_100: 14.0, passport_viscosity_index: 120, passport_density_15: 875, passport_flash_point: 220, passport_pour_point: -12, passport_tbn: 20 },
            { key: 'delvac_marine_1340', cat: 'main_engine',       oil_name: 'Mobil Delvac Marine 1340',      manufacturer: 'Mobil',    oil_category: 'Моторное судовое',          sae_grade: 'SAE 40',     passport_viscosity_40: 109,  passport_viscosity_100: 14.1, passport_viscosity_index: 110, passport_density_15: 882, passport_flash_point: 215, passport_pour_point: -15, passport_tbn: 12 },
            { key: 'castrol_lmx_40',     cat: 'main_engine',       oil_name: 'Castrol LMX 40',                manufacturer: 'Castrol', oil_category: 'Моторное судовое',          sae_grade: 'SAE 40',     passport_viscosity_40: 118,  passport_viscosity_100: 14.2, passport_viscosity_index: 106, passport_density_15: 878, passport_flash_point: 220, passport_pour_point: -12, passport_tbn: 30 },
            { key: 'disola_m4030',       cat: 'main_engine',       oil_name: 'Total Lubmarine Disola M 4030', manufacturer: 'Total',    oil_category: 'Моторное судовое',          sae_grade: 'SAE 40',     passport_viscosity_40: 115,  passport_viscosity_100: 14.0, passport_viscosity_index: 108, passport_density_15: 879, passport_flash_point: 218, passport_pour_point: -12, passport_tbn: 30 },
            { key: 'lukoil_m14',         cat: 'main_engine',       oil_name: 'Лукойл Морское М-14Г2ЦС',      manufacturer: 'Лукойл',   oil_category: 'Моторное судовое',          sae_grade: 'SAE 40',     passport_viscosity_40: 114,  passport_viscosity_100: 13.8, passport_viscosity_index: 106, passport_density_15: 884, passport_flash_point: 210, passport_pour_point: -9,  passport_tbn: 14 },
            // === Вспомогательные двигатели и генераторы (15W-40) ===
            { key: 'rimula_r4x',         cat: 'aux_gen',           oil_name: 'Shell Rimula R4 X 15W-40',      manufacturer: 'Shell',    oil_category: 'Моторное (вспомогательное)', sae_grade: 'SAE 15W-40', passport_viscosity_40: 107,  passport_viscosity_100: 14.7, passport_viscosity_index: 135, passport_density_15: 869, passport_flash_point: 220, passport_pour_point: -30, passport_tbn: 13 },
            { key: 'castrol_crb',        cat: 'aux_gen',           oil_name: 'Castrol CRB Multi 15W-40',      manufacturer: 'Castrol', oil_category: 'Моторное (вспомогательное)', sae_grade: 'SAE 15W-40', passport_viscosity_40: 105,  passport_viscosity_100: 14.5, passport_viscosity_index: 130, passport_density_15: 868, passport_flash_point: 218, passport_pour_point: -30, passport_tbn: 13 },
            { key: 'total_rubia',        cat: 'aux_gen',           oil_name: 'Total Rubia TIR 8600 15W-40',   manufacturer: 'Total',    oil_category: 'Моторное (вспомогательное)', sae_grade: 'SAE 15W-40', passport_viscosity_40: 108,  passport_viscosity_100: 14.8, passport_viscosity_index: 133, passport_density_15: 870, passport_flash_point: 215, passport_pour_point: -33, passport_tbn: 12 },
            { key: 'delvac_1330',        cat: 'aux_gen',           oil_name: 'Mobil Delvac 1330',             manufacturer: 'Mobil',    oil_category: 'Моторное (вспомогательное)', sae_grade: 'SAE 30',     passport_viscosity_40: 95,   passport_viscosity_100: 11.5, passport_viscosity_index: 100, passport_density_15: 872, passport_flash_point: 210, passport_pour_point: -18, passport_tbn: 10 },
            // === Гидросистема (ISO VG 46) ===
            { key: 'tellus_s2v46',       cat: 'hydraulic',         oil_name: 'Shell Tellus S2 V 46',          manufacturer: 'Shell',    oil_category: 'Гидравлическое',            iso_vg_grade: 'ISO VG 46', passport_viscosity_40: 46,   passport_viscosity_100: 7.0,  passport_viscosity_index: 152, passport_density_15: 870, passport_flash_point: 204, passport_pour_point: -39 },
            { key: 'mobil_dte46',        cat: 'hydraulic',         oil_name: 'Mobil DTE 10 Excel 46',         manufacturer: 'Mobil',    oil_category: 'Гидравлическое',            iso_vg_grade: 'ISO VG 46', passport_viscosity_40: 46,   passport_viscosity_100: 7.3,  passport_viscosity_index: 160, passport_density_15: 862, passport_flash_point: 226, passport_pour_point: -42 },
            { key: 'hyspin_aws46',       cat: 'hydraulic',         oil_name: 'Castrol Hyspin AWS 46',         manufacturer: 'Castrol', oil_category: 'Гидравлическое',            iso_vg_grade: 'ISO VG 46', passport_viscosity_40: 46,   passport_viscosity_100: 6.8,  passport_viscosity_index: 105, passport_density_15: 876, passport_flash_point: 200, passport_pour_point: -30 },
            { key: 'equivis_zs46',       cat: 'hydraulic',         oil_name: 'Total Equivis ZS 46',           manufacturer: 'Total',    oil_category: 'Гидравлическое',            iso_vg_grade: 'ISO VG 46', passport_viscosity_40: 46,   passport_viscosity_100: 7.1,  passport_viscosity_index: 150, passport_density_15: 869, passport_flash_point: 205, passport_pour_point: -36 },
            { key: 'lukoil_hydro46',     cat: 'hydraulic',         oil_name: 'Лукойл Гидро HV 46',           manufacturer: 'Лукойл',   oil_category: 'Гидравлическое',            iso_vg_grade: 'ISO VG 46', passport_viscosity_40: 46,   passport_viscosity_100: 7.0,  passport_viscosity_index: 148, passport_density_15: 872, passport_flash_point: 202, passport_pour_point: -36 },
            // === Редуктор главный (ISO VG 220) ===
            { key: 'omala_s2g_220',      cat: 'gearbox_big',       oil_name: 'Shell Omala S2 G 220',          manufacturer: 'Shell',    oil_category: 'Редукторное',               iso_vg_grade: 'ISO VG 220', passport_viscosity_40: 220,  passport_viscosity_100: 19.0, passport_viscosity_index: 97,  passport_density_15: 900, passport_flash_point: 230, passport_pour_point: -12 },
            { key: 'mobil_gear_220',     cat: 'gearbox_big',       oil_name: 'Mobil Gear 600 XP 220',         manufacturer: 'Mobil',    oil_category: 'Редукторное',               iso_vg_grade: 'ISO VG 220', passport_viscosity_40: 220,  passport_viscosity_100: 19.4, passport_viscosity_index: 98,  passport_density_15: 898, passport_flash_point: 228, passport_pour_point: -15 },
            { key: 'castrol_alpha_220',  cat: 'gearbox_big',       oil_name: 'Castrol Alpha SP 220',          manufacturer: 'Castrol', oil_category: 'Редукторное',               iso_vg_grade: 'ISO VG 220', passport_viscosity_40: 220,  passport_viscosity_100: 18.5, passport_viscosity_index: 95,  passport_density_15: 902, passport_flash_point: 225, passport_pour_point: -15 },
            // === Рулевой редуктор (SAE 80W-90) ===
            { key: 'spirax_80w90',       cat: 'gearbox_steering',  oil_name: 'Shell Spirax S2 G 80W-90',      manufacturer: 'Shell',    oil_category: 'Редукторное',               sae_grade: 'SAE 80W-90',  passport_viscosity_40: 136,  passport_viscosity_100: 14.5, passport_viscosity_index: 105, passport_density_15: 898, passport_flash_point: 200, passport_pour_point: -21 },
            { key: 'delvac_gear_80w90',  cat: 'gearbox_steering',  oil_name: 'Mobil Delvac Gear Oil 80W-90',  manufacturer: 'Mobil',    oil_category: 'Редукторное',               sae_grade: 'SAE 80W-90',  passport_viscosity_40: 136,  passport_viscosity_100: 14.5, passport_viscosity_index: 105, passport_density_15: 895, passport_flash_point: 202, passport_pour_point: -24 },
        ];

        const oilRecords = oilData.map(({ key, cat, ...rest }) => rest);
        const createdOils = await db.OilReference.bulkCreate(oilRecords);
        const oilIds = {};
        createdOils.forEach((oil, i) => { oilIds[oilData[i].key] = oil.id; });
        console.log('✅ Масла созданы:', createdOils.length);

        // ─── 3. VESSELS (30) ───────────────────────────────────────────────────
        // twoME = true → 2 главных двигателя
        const vessels = [
            // Сухогрузы Волго-Дон (реальная серия ДонРечФлот)
            { name: 'Волго-Дон 5001', reg: 'РТМ-5001-Р', twoME: false },
            { name: 'Волго-Дон 5002', reg: 'РТМ-5002-Р', twoME: false },
            { name: 'Волго-Дон 5003', reg: 'РТМ-5003-Р', twoME: false },
            { name: 'Волго-Дон 5004', reg: 'РТМ-5004-Р', twoME: false },
            { name: 'Волго-Дон 5005', reg: 'РТМ-5005-Р', twoME: false },
            { name: 'Волго-Дон 5038', reg: 'РТМ-5038-Р', twoME: true  }, // реальное: 2×662 кВт
            { name: 'Волго-Дон 201',  reg: 'РТМ-0201-Р', twoME: false },
            { name: 'Волго-Дон 202',  reg: 'РТМ-0202-Р', twoME: false },
            { name: 'Волго-Дон 203',  reg: 'РТМ-0203-Р', twoME: false },
            { name: 'Волго-Дон 204',  reg: 'РТМ-0204-Р', twoME: false },
            { name: 'Волго-Дон 205',  reg: 'РТМ-0205-Р', twoME: false },
            // Именные суда (реальные)
            { name: 'Ахмат Кадыров',  reg: 'РТМ-1123-Р', twoME: true  }, // реальное: 2×900 кВт
            { name: 'В. Успенский',   reg: 'РТМ-0389-Р', twoME: true  },
            { name: 'Валерий Коков',  reg: 'РТМ-0859-Р', twoME: false },
            // Буксиры ОТА (реальная серия)
            { name: 'ОТА 900',        reg: 'РБТ-0900-Р', twoME: false },
            { name: 'ОТА 901',        reg: 'РБТ-0901-Р', twoME: false },
            { name: 'ОТА 902',        reg: 'РБТ-0902-Р', twoME: false },
            { name: 'ОТА 921',        reg: 'РБТ-0921-Р', twoME: false },
            // Буксиры ОТ-1500 (двухвинтовые, реальная серия)
            { name: 'ОТ-1501',        reg: 'РБТ-1501-Р', twoME: true  },
            { name: 'ОТ-1502',        reg: 'РБТ-1502-Р', twoME: true  },
            { name: 'ОТ-1503',        reg: 'РБТ-1503-Р', twoME: true  },
            // Именные суда (частично реальные типы, частично вымышленные имена)
            { name: 'Сибирский 2119', reg: 'РТМ-2119-Р', twoME: false },
            { name: 'Тихий Дон',      reg: 'РТМ-0431-Р', twoME: false },
            { name: 'Атаман Платов',  reg: 'РТМ-0532-Р', twoME: false },
            { name: 'Донской',        reg: 'РТМ-0614-Р', twoME: false },
            { name: 'Азов',           reg: 'РТМ-0715-Р', twoME: false },
            { name: 'Богатырь',       reg: 'РТМ-0816-Р', twoME: true  },
            { name: 'Казак Ермак',    reg: 'РТМ-0917-Р', twoME: false },
            { name: 'Степан Разин',   reg: 'РТМ-1018-Р', twoME: false },
            { name: 'Ростовчанин',    reg: 'РТМ-1119-Р', twoME: false },
        ];

        const assetRecords = vessels.map(v => ({
            client_id: client.id,
            asset_name: v.name,
            asset_type: 'vessel',
            registration_number: v.reg,
            location: 'Азово-Донской бассейн',
            comments: v.twoME ? 'Двухвинтовое судно, два главных двигателя' : ''
        }));
        const createdAssets = await db.Asset.bulkCreate(assetRecords);
        const assetMap = {};
        createdAssets.forEach((a, i) => { assetMap[vessels[i].name] = { ...a, twoME: vessels[i].twoME }; });
        console.log('✅ Суда созданы:', createdAssets.length);

        // ─── 4. EQUIPMENT UNITS ────────────────────────────────────────────────
        const pick = (arr, idx) => arr[Math.abs(idx) % arr.length];

        const meManufacturers = ['Wärtsilä', 'MAN B&W', 'Caterpillar', 'Русский дизель', 'Cummins'];
        const meModels        = ['6CHRN36/45', '8NVD48', 'G-60', '6NVD-48', 'C18 ACERT'];
        const aeManufacturers = ['Perkins', 'Deutz', 'Volvo Penta', 'Yanmar', 'Cummins'];
        const aeModels        = ['1106D-E66TA', 'TCD 2015 V6', 'D12-425A', '6LY3-STP', 'QSB7'];
        const genManufacturers = ['Stamford', 'Leroy Somer', 'Mecc Alte', 'Marelli'];
        const genModels        = ['UCI274G', 'LSA 43.2', 'ECP 34-4L', 'MJB 160 MA4'];
        const hydManufacturers = ['Bosch Rexroth', 'Parker', 'Vickers', 'Eaton'];
        const hydModels        = ['A10VO45', 'P2062', 'V20', 'PVH057'];
        const gbManufacturers  = ['Rolls-Royce', 'Wesmar', 'Craftsman Marine', 'Wartsila'];
        const gbModels         = ['TT-1200', 'WF-200', 'CM-350', 'SST-100'];

        const mainEngineOilKeys   = ['gadinia_s3_40', 'gadinia_al_40', 'delvac_marine_1340', 'castrol_lmx_40', 'disola_m4030', 'lukoil_m14'];
        const auxEngineOilKeys    = ['rimula_r4x', 'castrol_crb', 'total_rubia', 'delvac_1330'];
        const hydraulicOilKeys    = ['tellus_s2v46', 'mobil_dte46', 'hyspin_aws46', 'equivis_zs46', 'lukoil_hydro46'];
        const gearboxBigOilKeys   = ['omala_s2g_220', 'mobil_gear_220', 'castrol_alpha_220'];
        const steeringOilKeys     = ['spirax_80w90', 'delvac_gear_80w90'];
        const samplingMethods     = ['pump', 'drain_plug', 'minimess_port'];

        const allEquipData = [];  // records to bulkCreate
        const allEquipMeta = [];  // parallel metadata (oilKey, oilVolume, etc.)

        vessels.forEach((vessel, vi) => {
            const asset = assetMap[vessel.name];
            const baseHours = 5000 + vi * 250;

            // Main engine(s)
            const numME = vessel.twoME ? 2 : 1;
            for (let e = 0; e < numME; e++) {
                const suffix = numME > 1 ? ` №${e + 1}` : '';
                allEquipData.push({
                    client_id: client.id, asset_id: asset.id,
                    unit_name: `Главный двигатель${suffix}`,
                    equipment_type: 'main_engine',
                    manufacturer: pick(meManufacturers, vi + e),
                    model: pick(meModels, vi + e),
                    total_operating_hours: baseHours + 2000 + e * 50,
                });
                allEquipMeta.push({ asset_id: asset.id, unit_name: `Главный двигатель${suffix}`, oilKey: pick(mainEngineOilKeys, vi + e), oilVolume: 250, samplingMethod: pick(samplingMethods, vi + e), baseHours: baseHours + 2000 + e * 50 });
            }

            // Auxiliary engine
            allEquipData.push({ client_id: client.id, asset_id: asset.id, unit_name: 'Вспомогательный двигатель', equipment_type: 'aux_engine', manufacturer: pick(aeManufacturers, vi), model: pick(aeModels, vi), total_operating_hours: baseHours + 1500 });
            allEquipMeta.push({ asset_id: asset.id, unit_name: 'Вспомогательный двигатель', oilKey: pick(auxEngineOilKeys, vi), oilVolume: 20, samplingMethod: pick(samplingMethods, vi + 1), baseHours: baseHours + 1500 });

            // Generator
            allEquipData.push({ client_id: client.id, asset_id: asset.id, unit_name: 'Генератор', equipment_type: 'generator', manufacturer: pick(genManufacturers, vi), model: pick(genModels, vi), total_operating_hours: baseHours + 1800 });
            allEquipMeta.push({ asset_id: asset.id, unit_name: 'Генератор', oilKey: pick(auxEngineOilKeys, vi + 1), oilVolume: 15, samplingMethod: pick(samplingMethods, vi + 2), baseHours: baseHours + 1800 });

            // Hydraulic system
            allEquipData.push({ client_id: client.id, asset_id: asset.id, unit_name: 'Гидросистема', equipment_type: 'hydraulic', manufacturer: pick(hydManufacturers, vi), model: pick(hydModels, vi), total_operating_hours: baseHours + 1000 });
            allEquipMeta.push({ asset_id: asset.id, unit_name: 'Гидросистема', oilKey: pick(hydraulicOilKeys, vi), oilVolume: 80, samplingMethod: pick(['pump', 'minimess_port'], vi), baseHours: baseHours + 1000 });

            // Steering gearbox (рулевой редуктор)
            allEquipData.push({ client_id: client.id, asset_id: asset.id, unit_name: 'Рулевой редуктор', equipment_type: 'gearbox', manufacturer: pick(gbManufacturers, vi), model: pick(gbModels, vi), total_operating_hours: baseHours + 1000 });
            allEquipMeta.push({ asset_id: asset.id, unit_name: 'Рулевой редуктор', oilKey: pick(steeringOilKeys, vi), oilVolume: 25, samplingMethod: 'drain_plug', baseHours: baseHours + 1000 });
        });

        const createdUnits = await db.EquipmentUnit.bulkCreate(allEquipData);
        console.log('✅ Единицы оборудования созданы:', createdUnits.length);

        // ─── 5. SAMPLING POINTS ────────────────────────────────────────────────
        const spData = createdUnits.map((unit, i) => {
            const meta = allEquipMeta[i];
            return {
                client_id: client.id,
                asset_id: meta.asset_id,
                equipment_unit_id: unit.id,
                point_name: `${meta.unit_name} — точка отбора`,
                oil_type_id: oilIds[meta.oilKey],
                oil_volume: meta.oilVolume,
                current_total_hours: meta.baseHours,
                current_oil_hours: Math.round(meta.baseHours * 0.12),
                sampling_method: meta.samplingMethod,
            };
        });
        const createdSPs = await db.SamplingPoint.bulkCreate(spData);
        console.log('✅ Точки отбора созданы:', createdSPs.length);

        // ─── 6. OIL LIFECYCLES ─────────────────────────────────────────────────
        const lcData = createdSPs.map((sp, i) => {
            const meta = allEquipMeta[i];
            return {
                sampling_point_id: sp.id,
                oil_type_id: oilIds[meta.oilKey],
                start_date: '2025-01-20',
                start_operating_hours: meta.baseHours - 800,
                status: 'active',
                start_reason: 'Плановая замена масла',
                comments: '',
            };
        });
        const createdLCs = await db.OilLifecycle.bulkCreate(lcData);
        console.log('✅ Жизненные циклы созданы:', createdLCs.length);

        // ─── 7. OIL SAMPLES (bi-weekly, Dec 2025 – May 2026) ─────────────────
        // Generate bi-weekly dates
        const sampleDates = [];
        let d = new Date('2025-12-01');
        const endDate = new Date('2026-05-16'); // last completed sample before today
        while (d <= endDate) {
            sampleDates.push(d.toISOString().split('T')[0]);
            d = new Date(d.getTime() + 14 * 24 * 60 * 60 * 1000);
        }
        // Add two more recent samples
        sampleDates.push('2026-05-20'); // in_analysis
        sampleDates.push('2026-05-28'); // pending

        const now = new Date('2026-05-30');

        const allSamples = [];
        let sampleCounter = 1;

        createdSPs.forEach((sp, i) => {
            const meta = allEquipMeta[i];
            const unit = createdUnits[i];
            const lc = createdLCs[i];
            const baseTotal = meta.baseHours - 800;
            const hoursPerInterval = 200; // ~14 days × ~14 h/day

            sampleDates.forEach((dateStr, si) => {
                const sDate = new Date(dateStr);
                const daysDiff = (now - sDate) / (1000 * 60 * 60 * 24);

                let sample_status = 'completed';
                if (daysDiff < 7)  sample_status = 'pending';
                else if (daysDiff < 21) sample_status = 'in_analysis';

                const totalHrs = Math.round(baseTotal + si * hoursPerInterval);
                const oilHrs   = Math.round(800 + si * hoursPerInterval * 0.6);

                allSamples.push({
                    sample_number: `ДРФ-${String(sampleCounter++).padStart(5, '0')}`,
                    client_id: client.id,
                    asset_id: meta.asset_id,
                    equipment_unit_id: unit.id,
                    sampling_point_id: sp.id,
                    oil_type_id: oilIds[meta.oilKey],
                    lifecycle_id: lc.id,
                    sampling_date: dateStr,
                    total_hours_at_sampling: totalHrs,
                    oil_hours_at_sampling: oilHrs,
                    engine_state: si % 3 === 0 ? 'cold' : 'warm',
                    sample_status,
                    comments: sample_status === 'pending' ? 'Отправлена в лабораторию' : '',
                });
            });
        });

        // Batch insert samples
        const BATCH = 250;
        let batchCount = 0;
        for (let idx = 0; idx < allSamples.length; idx += BATCH) {
            await db.OilSample.bulkCreate(allSamples.slice(idx, idx + BATCH));
            batchCount++;
            console.log(`  Пакет проб ${batchCount}: ${Math.min(idx + BATCH, allSamples.length)}/${allSamples.length}`);
        }

        console.log('✅ Все данные успешно загружены!');
        return Response.json({
            success: true,
            message: 'Тестовые данные ДонРечФлот успешно загружены!',
            stats: {
                clients: 1,
                oils: createdOils.length,
                vessels: createdAssets.length,
                equipmentUnits: createdUnits.length,
                samplingPoints: createdSPs.length,
                lifecycles: createdLCs.length,
                samples: allSamples.length,
                sampleDates: sampleDates.length,
            }
        });

    } catch (error) {
        console.error('❌ Ошибка:', error.message, error.stack);
        return Response.json({ error: error.message }, { status: 500 });
    }
});