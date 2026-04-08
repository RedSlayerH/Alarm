# מבנה הפרויקט – מפת אזעקות

## עקרון הפרדת אחריות
כל קובץ אחראי על דבר אחד בלבד. שינוי בקובץ אחד לא אמור לשבור את האחרים.

---

## 📁 server/

| קובץ | אחריות | מתי לגעת בו |
|---|---|---|
| `config.js` | **כל** הקבועים (זמנים, URLs, פורט) | רוצה לשנות timeout של כטב"ם? רק כאן |
| `state.js` | כל ה-state: היסטוריה, פוליגונים, טיימרים | בדרך כלל לא נוגעים – רק דרך הפונקציות שלו |
| `alertProcessor.js` | לוגיקת עיבוד אזעקות (early/alert/clear) | שינוי לוגיקת מיזוג / שחרור / שדרוג |
| `orefPoller.js` | polling מה-API של פיקוד העורף | שינוי לוגיקת parsing של response |
| `testRoutes.js` | endpoints לבדיקה (`/api/test/*`) | הוספת בדיקות חדשות |
| `server.js` | נקודת כניסה, Express, routes | הוספת route חדש |
| `auth.js` | (קיים) הרשמה / התחברות | לוגיקת משתמשים |

### סדר תלויות (שרת):
```
config.js  ←  state.js  ←  alertProcessor.js  ←  orefPoller.js
                                                  ↑
                                            testRoutes.js
                                                  ↑
                                             server.js
```

---

## 📁 client/

| קובץ | אחריות | מתי לגעת בו |
|---|---|---|
| `js/map.js` | פוליגונים, צבעים, אנימציות על המפה | שינוי צבע / timeout אנימציה |
| `js/ui.js` | כרטיסיות, icons, פורמט זמן, מיזוג תצוגה | שינוי מראה הכרטיסיות |
| `js/panel.js` | גרירה, FAB, כיווץ, חיפוש | שינוי התנהגות הפאנל |
| `js/auth.js` | Modal כניסה/הרשמה | שינוי לוגיקת auth בצד לקוח |
| `js/main.js` | polling, חיבור בין המודולים | שינוי תדירות polling |
| `css/style.css` | כל ה-CSS | עיצוב |
| `index.html` | HTML בלבד, טוען את כל הקבצים | הוספת אלמנט HTML |

### סדר טעינת JS (חשוב!):
```
map.js → ui.js → panel.js → auth.js → main.js
```
`main.js` תמיד אחרון – הוא משתמש בפונקציות מכולם.

---

## 🐛 באגים שתוקנו

1. **`type` vs `threatType`** – היה שני שמות לאותו שדה ב-`activeMapLayers`. כעת רק `type`.
2. **טיימרים משותפים לרקטות ו-early** – עכשיו `earlyTimers` / `rocketTimers` / `droneTimers` נפרדים לחלוטין.
3. **דליפת זיכרון ב-`alertsHistory`** – `pruneHistory()` מנקה רשומות ישנות מ-24 שעות ומגביל ל-200 רשומות.
4. **`lastProcessedEventId` לא מאופס** – לא בעיה בפועל כי ה-ID תמיד ייחודי, אבל הלוגיקה מתועדת.

---

## 🔧 endpoints לבדיקה

```
GET /api/test/alert?cities=קריית שמונה,מטולה&type=ירי רקטות וטילים
GET /api/test/clear?cities=קריית שמונה,מטולה
GET /api/test/early?cities=אשדוד - א,גן יבנה
GET /api/test/drone?cities=אשקלון
```
