# ************************************************************
# Sequel Pro SQL dump
# Version 5446
#
# https://www.sequelpro.com/
# https://github.com/sequelpro/sequelpro
#
# Host: 127.0.0.1 (MySQL 8.1.0)
# Database: swarm-user
# Generation Time: 2023-10-08 20:26:55 +0000
# ************************************************************


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8 */;
SET NAMES utf8mb4;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;


# Dump of table locales
# ------------------------------------------------------------

DROP TABLE IF EXISTS `locales`;

CREATE TABLE `locales` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `key` varchar(60) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  `en` varchar(250) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  `ru` varchar(250) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  `et` varchar(250) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  `translation_context` tinytext COLLATE utf8mb4_general_ci,
  `date_added` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `tr` varchar(250) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `pl` varchar(250) COLLATE utf8mb4_general_ci DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `id` (`key`),
  UNIQUE KEY `key` (`key`,`en`),
  KEY `en` (`en`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

LOCK TABLES `locales` WRITE;
/*!40000 ALTER TABLE `locales` DISABLE KEYS */;

INSERT INTO `locales` (`id`, `key`, `en`, `ru`, `et`, `translation_context`, `date_added`, `tr`, `pl`)
VALUES
	(1,NULL,'Save','Сохранить','Salvesta',NULL,'2023-10-07 18:10:48','Kaydet','Zapisz'),
	(3,NULL,'Account','Настройки','Konto',NULL,'2023-10-07 18:10:48','Hesap','Konto'),
	(4,NULL,'Email','Почта','E-post',NULL,'2023-10-07 18:10:48','E-posta','Email'),
	(7,NULL,'Language','Язык','Keel',NULL,'2023-10-07 18:10:48','Dil','Język'),
	(8,NULL,'Hives','Улья','Tarud',NULL,'2023-10-07 18:10:48','Kovanlar','Ul.'),
	(10,NULL,'Analytics','Аналитика','Analüütika','','2023-10-07 18:10:48','Analitik','Analiza'),
	(12,NULL,'Log out','Выйти','Logi välja','','2023-10-07 18:10:48','Çıkış yap','Wyloguj się'),
	(13,NULL,'Terms of Use','Пользовательское соглашение','Kasutustingimused','link in page footer','2023-10-07 18:26:22','Kullanım Şartları','Warunki korzystania.'),
	(14,NULL,'Edit','Редактировать','Muuda','button to change beehive','2023-10-07 18:26:22','Düzenle','Edytuj'),
	(15,NULL,'Privacy policy','Политика конфиденциальности','Privaatsuspoliitika','link in page footer','2023-10-07 18:26:23','Gizlilik politikası','Polityka prywatności'),
	(16,NULL,'Add hive','Добавить улей','Lisa taru','button to add beehive','2023-10-07 18:26:24','Kovan ekle','Dodaj ul.\n'),
	(17,NULL,'Setup new apiary','Настройка новой пасеки','Lisa uus mesila','its a button','2023-10-07 18:26:25','Yeni kovan kurulumu','Ustaw nową pasiekę'),
	(21,NULL,'Name','Название','Nimi','','2023-10-07 18:33:13','Adı','Imię'),
	(22,NULL,'Queen','Матка','Mesilasema','this is a form label for input of the bee queen race and year','2023-10-07 18:34:16','Kraliçe','Królowa'),
	(23,NULL,'Notes','Заметки','Märkmed','','2023-10-07 18:35:57','Notlar','Notatki'),
	(25,NULL,'Add entrance','Добавить вход','Lisa sissepääs','','2023-10-07 20:19:38','Ekleme girişi','Dodaj wejście'),
	(28,NULL,'Add deep','Добавить гнездо','Lisa korpus','this is a button to add new section of beehive, a deep box that is intended for brood frames','2023-10-07 20:23:16','Derin ekle','Dodaj głębokie'),
	(29,NULL,'Add super','Добавить магазин','Lisa poolraami korpus','this is a button to add new section of beehive, a super box that is intended for honey frames','2023-10-07 20:23:17','Yeni süper ekle','Dodaj nadstawkę'),
	(30,NULL,'Add comb','Добавить соты','Lisa kärg','this is a button that adds new frame into a beehive which has wax added by bees on it','2023-10-07 21:04:02','Sot Ekle','Dodaj plastr'),
	(31,NULL,'Add foundation','Добавить вощину','Lisa kärjetatud raam','','2023-10-07 21:04:18','Ekleme temeli','Dodaj podkład'),
	(32,NULL,'Add empty frame','Добавить пустую рамку','Lisa tühi raam','this is a button that adds new frame into a beehive, but it has no cells or wax inside, only wooden frame','2023-10-07 21:06:25','Boş çerçeve ekle','Dodaj pustą ramkę'),
	(33,NULL,'Add feeder','Добавить кормушку','Lisa söötja','this is a button that adds new vertical frame-like container into a beehive, for sugar syrup to be poured in, to feed the bees','2023-10-07 21:07:49','Yeni kovan bölmesi ekleyen bir düğme. Arıları beslemek için şurup dökülen bir çerçeve benzeri konteynır ekler. \n\nTurkish translation: Kormuş ekle','Dodaj karmnik'),
	(35,NULL,'Add partition','Добавить перегородку','Lisa vahelaud','this is a button that adds new frame-like separator made of wood into a beehive to reduce available space for bees','2023-10-07 21:09:26','Bölme ekle','Dodaj przegrodę'),
	(43,NULL,'Close','Закрыть','Sulge','','2023-10-07 21:23:20','Kapat','Zamknij'),
	(44,NULL,'Remove frame','Удалить рамку','Eemalda raam','','2023-10-07 21:23:21','Çerçeveyi kaldır','Usuń ramkę'),
	(45,NULL,'Remove hive','Удалить улей','Eemalda taru','this is a button','2023-10-07 21:23:21','Kovanı kaldır','Usuń ul.'),
	(46,NULL,'Frame cells','Клетки рамки','Raamirakud','this is a button that toggles visibility of different types of cells in a beehive frame - brood, pollen, honey etc','2023-10-07 21:23:22','Rusça çeviriye dayanarak, Türkçe çevirisi \"Çerçeve hücreleri\" şeklindedir.','Komórki ramki'),
	(47,NULL,'Clear drawing','Очистить рисунок','Puhasta joonis','this is a button that cleans drawing made on an image with ipad pencil or mouse','2023-10-07 21:23:22','Rusça çeviriye dayanarak Türkçe\'ye çevirdiğimiz ifade şu şekildedir: \"Risayeti temizle\"','Wyczyść rysunek'),
	(48,NULL,'Queen cups','Маточники','Kuningattare tassid','this is a button that toggles visibility (on an image) of beewax construction where queen bee is being nursed','2023-10-07 21:23:25','Kraliçe kupalari','Półki dla królowej'),
	(49,NULL,'Undo','Отменить','Tühistama','','2023-10-07 21:23:26','Geri Al','Cofnij'),
	(50,NULL,'Upload frame photo','Загрузить фото рамки','Laadi raamifoto üles','this is a button which allows to select and upload a photo of a beehive frame','2023-10-07 21:26:34','Çerçeve fotoğrafı yükle','Prześlij zdjęcie ramki'),
	(51,NULL,'Detection best works with high-resolution photos (17MP)','Обнаружение лучше всего работает с фотографиями высокого разрешения (17 МП).','Avastamine toimib kõige paremini kõrge resolutsiooniga fotodega (17 MP).','','2023-10-07 21:26:35','Tespit, yüksek çözünürlüklü fotoğraflarla (17MP) en iyi şekilde çalışır.','Wykrywanie najlepiej działa z wysokiej rozdzielczości zdjęciami (17MP).'),
	(52,NULL,'Locate me','Найти меня','Leia mind','','2023-10-07 21:30:48','Beni bul','Zlokalizuj mnie'),
	(53,NULL,'Location','Местоположение','Asukoht','','2023-10-07 21:30:56','Konum','Lokalizacja'),
	(54,NULL,'Delete','Удалить','Kustuta','','2023-10-07 21:32:08','Sil','Usuń'),
	(55,NULL,'New apiary','Новая пасека','Uus mesila','','2023-10-07 21:33:48','Yeni arılık','Nowa pasieka'),
	(56,NULL,'Create','Создать','Lisa','','2023-10-07 21:34:05','Oluştur','Stwórz'),
	(57,NULL,'Subscribe','Подписаться','Tellima','','2023-10-07 21:36:40','Abone Ol','Zapisz się'),
	(58,NULL,'Billing','Оплата','Arveldamine','','2023-10-07 21:38:00','Faturalandırma','Fakturacja'),
	(59,NULL,'Created','Создано','Loodud','','2023-10-07 21:38:45','Oluşturuldu','Stworzone'),
	(60,NULL,'Expires at','Истекает','Aegub','','2023-10-07 21:39:11','Sona eriyor','Wygasa o'),
	(61,NULL,'API tokens','API ключи','API võtmed','','2023-10-07 21:40:37','API belirteçleri','Klucze API'),
	(62,NULL,'Copy','Копировать','Kopeeri','','2023-10-07 21:41:09','Kopya','Kopiuj'),
	(63,NULL,'Toggle','Показать','Vaheta','','2023-10-07 21:41:11','Aç/Kapat','Przełącz'),
	(64,NULL,'Generate','Cгенерировать','Genereeri','','2023-10-07 21:41:19','Oluştur','Generuj'),
	(65,NULL,'You can use raspberry PI client or access API directly with API tokens','Вы можете использовать клиент Raspberry PI или напрямую получать доступ к API с помощью API-токенов.','Saate kasutada Raspberry PI klienti või pääseda API-le otse API-tokenite abil.','','2023-10-07 21:57:52','Raspberry PI istemcisini kullanabilir veya API belirteçleriyle doğrudan API\'ye erişebilirsiniz.','Możesz używać klienta Raspberry PI lub mieć bezpośredni dostęp do API za pomocą tokenów API.'),
	(66,NULL,'Box count','Количество ящиков',NULL,'','2023-10-07 21:59:02',NULL,NULL),
	(67,NULL,'Section count','Количество секций','Korpuse arv','','2023-10-07 21:59:05','Bölüm sayısı','Liczba sekcji'),
	(68,NULL,'Frame count','Количество рамок','Raamide arv','','2023-10-07 21:59:13','Rusça çevirisi \"Количество рамок\" olan aşağıdaki ifadenin Türkçe çevirisi: \"Kovan sayısı\"','Liczenie ramek'),
	(69,NULL,'Capped Brood','Запечатанный расплод','Kinnishaudme kärg','','2023-10-07 23:51:40','Kapalı Yavrulama','Zakryta zmielona brodka'),
	(70,NULL,'Eggs','Посев','Munad','','2023-10-07 23:51:40','Yumurtalar','Jaja'),
	(71,NULL,'Honey','Мёд','Mesi','','2023-10-07 23:51:40','Bal','Miód'),
	(72,NULL,'Brood','Расплод','Avaskärg','','2023-10-07 23:51:40','Yavru','Lęgi'),
	(73,NULL,'Pollen','Пыльца','Õietolm','','2023-10-07 23:51:40','Polen','Pyłek'),
	(74,NULL,'No apiaries here yet','Здесь пока нет пасек','Siin pole veel mesilat','','2023-10-07 23:58:39','Henüz burada arıcılık yapılmamaktadır.','Tu jeszcze nie ma pasiek'),
	(75,NULL,'No hives here yet','Здесь пока нет ульев','Siin pole veel mesitarusid','','2023-10-07 23:59:29','Henüz burada kovan yok','Tu jeszcze nie ma uli'),
	(76,NULL,'Login','Войти','Sisene','','2023-10-08 00:19:50','Giriş','Zaloguj się'),
	(77,NULL,'Password','Пароль','Parool','','2023-10-08 00:23:03','Parola','Hasło'),
	(78,NULL,'Register','Зарегистрироваться','Registreeri','','2023-10-08 00:24:17','Kaydol','Zarejestruj się');

/*!40000 ALTER TABLE `locales` ENABLE KEYS */;
UNLOCK TABLES;



/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;
/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
