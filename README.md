# WebXR Quest 3 – El takibiyle gezinme (1:70 mimari maket)

Backend ve build gerektirmeyen, GitHub Pages'te çalışan statik bir WebXR projesi. Quest 3'te kontrolcüsüz, yalnızca el pinch'leriyle 1:70 ölçekli bir maketin içinde insan gözüyle dolaşılır. Masaüstünde aynı jest mantığı webcam + MediaPipe ile çalışır.

> **Doğrulama durumu:** Jest motoru Node ile otomatik test edildi (8 test geçti). WebXR, Quest 3 el takibi, MediaPipe ve render kısmı **gerçek cihazda ve tarayıcıda çalıştırılarak doğrulanmadı**; aşağıdaki "Test listesi" bölümündeki maddeleri cihazda siz doğrulamalısınız.

## Dosya yapısı

```
index.html            importmap (three, MediaPipe, sabit sürümlü CDN), arayüz
css/style.css
js/main.js            renderer, döngü, arayüz, masaüstü bakış
js/xr-manager.js      immersive-vr oturumu, referans alanı fallback, temizlik
js/hand-tracking.js   WebXR joint pozları -> ortak jest girdisi, el görselleştirme
js/desktop-hands.js   webcam + MediaPipe Hand Landmarker, landmark çizimi
js/gestures.js        ortak jest motoru (pinch oranı, hysteresis, öncelik)
js/locomotion.js      ScaleConfig, yürüme ve dönüş
js/scene.js           test sahnesi + .glb/.gltf yükleyici (listede olmayan ek dosya)
tests/                jest motoru birim testleri
```

## Kontroller

| Hareket | Fonksiyon |
|---|---|
| Başparmak + işaret parmağı | İleri (bakılan yatay yönde, 1.4 m/s gerçek ölçek) |
| Başparmak + serçe | Sağa dön (50 °/s, yumuşak) |
| Başparmak + yüzük | Sola dön |
| Pinch yok / el kayıp | Dur |

- **Normalizasyon:** pinch oranı = (başparmak ucu ↔ parmak ucu) / (bilek ↔ orta parmak MCP). Basma eşiği `0.32`, bırakma eşiği `0.48` (hysteresis).
- **Öncelik:** Aynı anda tek jest etkindir. Aday jestler arasında en sıkı pinch kazanır; başlamış jest, aynı elde ancak `0.08` daha sıkı bir pinch çıkarsa değişir. İki el izlenir ama aynı anda tek jest uygulanır. `40 ms` kararlı temas olmadan jest başlamaz; bırakma anında etki eder.
- Tüm sabitler `js/gestures.js` (`DEFAULTS`) ve `js/locomotion.js` (`ScaleConfig`) içindedir. Eşikler gerçek cihazda ince ayar isteyebilir.

## 1:70 ölçek yöntemi

İki ayrı dönüşüm vardır, ikisi de `ScaleConfig.scale = 1/70` değerinden gelir:

1. **Model:** Mimari içerik gerçek metre ile çizilir ve `modelRoot.scale = 1/70` ile maket olur (1 sahne birimi = maketin 1 m'si). `.glb` dosyaları gerçek ölçekliyse otomatik küçülür.
2. **Kullanıcı:** XR takip uzayı gerçek metredir. Kamerayı `rig` grubuna koyup `rig.scale = 1/70` yapıyoruz. Head pose'a dokunulmaz, kameraya sabit yükseklik verilmez. Gerçek 1.60 m göz yüksekliği sahnede `1.60/70 ≈ 0.02286` birim olur; kafa hareketi ve IPD aynı oranda küçülür. Böylece kullanıcı, 70 kat büyütülmüş bir binada insan boyunda dolaşıyormuş gibi görür.

Hız da aynı çarpanla uygulanır: `1.4 m/s × (1/70) = 0.02 birim/s`. Pinch eşikleri ve el verisi takip uzayında (gerçek metre) hesaplanır, rig ölçeğinden etkilenmez. `near/far` değerleri rig-yerel (gerçek) metredir; `near=0.1`, `far=500`.

`local-floor` alınamazsa `local` kullanılır ve rig'e `1.60/70` yükseklik eklenir (uyarı gösterilir).

## GitHub Pages'e yayınlama

1. Klasörün içeriğini bir GitHub deposuna yükleyin (`index.html` depo kökünde olsun).
2. **Settings → Pages → Build and deployment → Source: Deploy from a branch**, branch `main`, klasör `/ (root)`.
3. Birkaç dakika sonra `https://<kullanici>.github.io/<depo>/` adresi açılır (HTTPS, WebXR için gereklidir). Tüm yollar göreli olduğundan alt dizinde çalışır.

## Quest 3'te test

1. Quest ayarlarında **Hareket ve kontrolcüler → El takibi** açık olsun, kontrolcüleri bırakın.
2. Quest Browser ile Pages adresini açın, **Enter VR**'a basın.
3. Elleriniz görünür ve alt kısımda küçük bir gösterge belirir: sol nokta = sola dönüş, orta = ileri, sağ = sağa dönüş (aktifken yeşil/turuncu), üstteki nokta = el takibi (yeşil/kırmızı).
4. Pinch'leri deneyin; çıkmak için Quest menüsünden oturumu kapatın. Sayfa masaüstü moduna hatasız dönmelidir.

El algılanmazsa 6 saniye sonra uyarı çıkar. Kendi modelinizi denemek için dosyayı `assets/models/` altına koyup `?model=assets/models/bina.glb` ekleyin (zaten 1:70 hazırlandıysa `&authored=model`).

## Masaüstü testi

`Start Camera` → onay penceresi → kamera izni. Video üzerinde landmark'lar çizilir, jestler aynı motorla çalışır. Sahnede fareyle sürükleyerek bakış yönünü değiştirebilirsiniz. Quest'te oturum başlayınca webcam otomatik kapanır.

Yerelde denemek için `python3 -m http.server` ve `http://localhost:8000` yeterlidir (localhost güvenli bağlam sayılır).

## Otomatik testler

```
npm test      # veya: node --test tests/*.test.mjs
```

Pinch normalizasyonu, hysteresis, öncelik, onset gecikmesi, iki el ve el kaybı kapsanır.

## Test listesi (cihazda doğrulanması gerekenler)

- Enter VR sonrası `local-floor` mu `local` mi seçildi (debug panelde görünmez, VR içinde göz yüksekliğine bakın).
- Pinch eşiklerinin gerçek eller için uygun olup olmadığı, özellikle yüzük/serçe ayrımı.
- `near=0.1` / `far=500` ile 1/70 ölçekli rig'de derinlik ve kırpma davranışı.
- Hareketin baş yönüne göre doğru yönde olduğu, dönüşün baş etrafında gerçekleştiği.

## Bilinen sınırlar

Çarpışma yok (duvarlardan geçilir). Yürüme ve dönüş aynı anda yapılamaz. Elleri çizen küreler basit tutuldu. MediaPipe modeli Google'ın depolama adresinden indirilir.
