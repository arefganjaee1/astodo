# ✦ AsTodo

پروژه مدیریت تسک شخصی با sync بین Mac و iPhone

---

## نصب و راه‌اندازی

### پیش‌نیاز
- **Node.js** نصب باشه → [nodejs.org](https://nodejs.org)
- Mac و iPhone روی **یک WiFi** باشند

---

### ۱. اجرا روی Mac

```bash
# پوشه پروژه رو باز کن
cd AsTodo

# اسکریپت رو اجرا کن
chmod +x start.sh
./start.sh
```

بعد از اجرا توی ترمینال می‌بینی:

```
🚀 AsTodo Server running!
📱 iPhone URL: http://192.168.1.x:3131
🖥️  Mac URL:   http://localhost:3131
```

---

### ۲. باز کردن روی Mac

مرورگر رو باز کن و برو به:
```
http://localhost:3131
```

یا اگه می‌خوای **کنار VS Code** باز بشه:
- از اکستنشن **Browser Preview** استفاده کن
- یا یه پنجره مرورگر جداگانه کنار VS Code بذار

---

### ۳. نصب روی iPhone

1. **Safari** رو باز کن (حتماً Safari، نه Chrome)
2. آدرس iPhone رو وارد کن: `http://192.168.1.x:3131`
3. دکمه **Share** رو بزن (مربع با فلش بالا)
4. **"Add to Home Screen"** رو انتخاب کن
5. اسم رو `AsTodo` بذار و **Add** بزن

حالا AsTodo مثل یه اپ native روی Home Screen داری! 🎉

---

## ویژگی‌ها

- ✦ **Feature** - فیچرهای جدید
- ⚡ **Bug** - باگ‌ها
- ↑ **Improve** - بهبودها
- ◎ **Note** - نکته‌ها

**اولویت‌بندی:** 🔥 Urgent / ↑ High / · Medium / ↓ Low

**AI Help:** دکمه `✦ AI Help` توی فرم رو بزن تا Claude برات پیشنهاد بده

**Sync:** همه تغییرات real-time بین Mac و iPhone sync میشه

---

## دیتا کجا ذخیره میشه؟

فایل دیتابیس: `~/.astodo.db`

---

## اجرای خودکار هنگام روشن شدن Mac (اختیاری)

```bash
# یه LaunchAgent بساز
cat > ~/Library/LaunchAgents/com.astodo.plist << EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.astodo</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>FULL_PATH_TO/AsTodo/start.sh</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
</dict>
</plist>
EOF

# فعال کن
launchctl load ~/Library/LaunchAgents/com.astodo.plist
```

`FULL_PATH_TO` رو با مسیر واقعی پوشه جایگزین کن.
