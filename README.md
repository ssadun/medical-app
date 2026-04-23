# Medical App — Kurulum Rehberi

## Dosya Yapısı
```
medical-app/
├── Dockerfile
├── docker-compose.yml
├── package.json
├── server.js
├── data/
│   └── medical_data.json   ← tüm verileriniz burada
└── public/
    └── index.html
```

---

## Synology NAS'a Kurulum

### 1. Dosyaları NAS'a Kopyala
Tüm `medical-app` klasörünü NAS'ınıza kopyalayın. Önerilen konum:
```
/volume1/docker/medical-app/
```

File Station veya SCP kullanabilirsiniz:
```bash
scp -r medical-app/ admin@NAS_IP:/volume1/docker/
```

### 2. Synology'de Docker Kurulumu
- DSM → Package Center → **Container Manager** (eski adı: Docker) → Yükle

### 3. SSH ile Bağlan ve Başlat
```bash
ssh admin@NAS_IP
cd /volume1/docker/medical-app
sudo docker-compose up -d --build
```

### 4. Uygulamaya Eriş
Tarayıcınızdan açın:
```
http://NAS_IP:3000
```

---

## Uzaktan Erişim (QuickConnect / VPN)

### Synology QuickConnect ile:
1. DSM → Denetim Masası → QuickConnect → Etkinleştir
2. Reverse Proxy ekle:
   - DSM → Denetim Masası → Uygulama Portalı → Ters Proxy
   - Kaynak: `https://medical.quickconnect.to`
   - Hedef: `http://localhost:3000`

### Tailscale ile (Önerilen — daha güvenli):
1. Synology Package Center → Tailscale → Yükle
2. Giriş yap
3. Telefon/bilgisayarınıza da Tailscale kurun
4. NAS'ın Tailscale IP'si üzerinden erişin: `http://100.x.x.x:3000`

---

## Güncelleme / Yeniden Başlatma
```bash
cd /volume1/docker/medical-app
sudo docker-compose restart          # sadece yeniden başlat
sudo docker-compose up -d --build    # kod değişikliği sonrası rebuild
```

## Durdurma
```bash
sudo docker-compose down
```

## Veri Yedekleme
Sadece `data/medical_data.json` dosyasını yedekleyin — tüm kayıtlarınız orada.

---

## Özellikler
- 📊 Dashboard — son referans dışı değerler
- 🔍 Arama ve filtreleme (tesis, yıl, normal/anormal)
- 📈 Trend grafiği — herhangi bir medical için zaman serisi
- ➕ Yeni kayıt ekleme formu
- 📄 PDF import — medical raporlarını otomatik ayrıştır
- 🗑️ Kayıt silme
- 💾 Veriler JSON dosyasında — okunabilir ve yedeklenebilir
