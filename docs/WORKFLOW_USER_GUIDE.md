# Workflow User Guide

Aa file ma full samjan aapi chhe ke app nu workflow kai rite kaam kare chhe, kai page su kaam mate chhe, ane kai field ma su bharvanu chhe.

## 1. System No Main Idea

Aa product no main flow `Google Drive -> Import File -> Content Queue -> Detail View -> Schedule / Post` par aadharit chhe.

Simple ma:

1. Drive ma folders and files hase
2. Tame Drive Browser page par jai ne folder kholo
3. Image/video preview karo
4. Je file use karvi hoi tene queue ma import karo
5. Queue table ma badha planning fields bharo
6. Detail page ma jai ne ek-ek item ni full planning karo
7. Schedule/post workflow chalavo

## 2. User Roles

### `super_admin`

- platform level user
- business create kari shake
- business structure manage kari shake
- badha businesses joi shake

### `admin`

- specific business handle kare
- Google Drive connect kare
- Instagram account connect kare
- files import kare
- queue manage kare
- scheduling/posting kare

### `user`

- business na data joi shake where allowed
- queue/detail workflow ma kaam kari shake depending on access

## 3. Full Workflow Step By Step

### Step 1: First Login / Setup

Pehla `super_admin` create karo:

- open `http://localhost:5173/setup`
- name, email, password bharo
- aa first platform owner account banse

Pachi login:

- open `http://localhost:5173/login`

### Step 2: First Business Create Karvu

`super_admin` login pachi:

- `Businesses` page kholo
- navi business create karo

Business create karya vagar baki no workflow proper nahi chale, karan ke Drive, Instagram, media, queue badhu business sathe attach thay chhe.

### Step 3: Admin User Add Karvo

`Businesses` page par:

- business select karo
- member add karo
- role `admin` select karo
- password field ma login password set karo

Aa admin business-level kaam sambhalse.

Important:

- admin mate alag login page nathi
- admin pan same `/login` page par login kare chhe
- login pachi role and business membership thi access male chhe

### Step 4: Google Drive Connect Karvu

Admin e:

- `Drive Browser` page kholo
- `Connect Google Drive` karo
- Google account authorize karo

Pachi Drive na folders/files app ma dekhase.

### Step 5: Folder and Files Browse Karva

Drive Browser ma:

- left side ma folders dekhase
- koi folder click karo
- right side ma image/video cards dekhase
- preview/open/import options male

### Step 6: Queue Ma Import Karvu

Je file par kaam karvu chhe:

- `Import to queue` click karo

Pachi aa item `Content Queue` page ma row tarike dekhase.

### Step 7: Queue Table Ma Planning Karvi

Queue page par:

- file-wise badha rows dekhase
- same `Group ID` aapo to carousel banavi shakay
- `Status`, `Scheduled Time`, `AI Caption`, `IG Media ID`, `Likes / Reach` manage kari shakay

### Step 8: Detail Page Ma Deep Edit Karvu

Queue row ma `Open` click karo.

Detail page ma:

- file preview dekhase
- current metadata dekhase
- scheduling/editing kari shakase
- grouped files pan dekhase if same group id hoi

## 4. Page Wise Samjan

## 4.1 Overview Page

Aa dashboard page chhe.

Aa page par:

- total files ketli chhe
- new items ketla chhe
- scheduled ketla chhe
- live ketla chhe
- errors ketla chhe
- upcoming schedule su chhe

Use:

- business ni quick summary mate
- current queue ni health samajva mate

## 4.2 Drive Browser Page

Aa sauthi important page chhe jo tame Drive-first workflow use karo chho.

Aa page par tame:

- Google Drive connect karo
- folders browse karo
- files preview karo
- image/video open karo
- queue ma import karo

### Left Section

- folder list
- root folder
- selected folder

### Right Section

- selected folder ni files
- image preview
- video preview/open option
- `Import to queue` button

Use case:

- pehla samjo ke Drive ma kai files chhe
- pachi correct files import karo

## 4.3 Content Queue Page

Aa operational main page chhe.

Aa page ek table chhe jema badhu planning same jagya par kari shakay.

Every row = one file

Jo multiple images ne carousel banavvi hoi, to badha rows ma same `Group ID` aapo.

### Queue Table Columns

#### 1. `File Name`

Aa imported file nu naam chhe.

Example:

- `photo_001.jpg`
- `festival_reel.mp4`

Use:

- kai file par kaam thai rahyu chhe e olakhva

#### 2. `Drive File ID`

Aa Google Drive ni unique file ID chhe.

Use:

- original Drive file ne trace karva
- debug / matching mate

Jo local file hoi to aa blank hoi shake.

#### 3. `Status`

Dropdown values:

- `new`
- `scheduled`
- `posting`
- `live`
- `error`

Meaning:

- `new`: file import thai chuki chhe pan planning baki chhe
- `scheduled`: post time set chhe
- `posting`: currently publish flow ma chhe
- `live`: post live thai gayi chhe
- `error`: koi problem aavi chhe

#### 4. `Group ID`

Aa sauthi important field chhe carousel mate.

Example:

- image 1 -> group `1`
- image 2 -> group `1`
- image 3 -> group `1`

To aa tran image ek carousel group ma gani shakay.

Jo single post hoi to:

- blank muki shako
- athva own group style numbering use kari shako

#### 5. `Post Type`

Values:

- `single`
- `carousel`
- `video`

Meaning:

- `single`: ek image
- `carousel`: multiple images same group id sathe
- `video`: video or reel type

Rule:

- image + no group => generally `single`
- image + same group => `carousel`
- video => `video`

#### 6. `Scheduled Time`

Aa post no planned date-time chhe.

Format UI ma:

- datetime picker thi

System internally ISO datetime ma store kare chhe.

Use:

- post kyare live karvani chhe e define karva

#### 7. `AI Caption`

Aa field caption/draft mate chhe.

At present tame manually pan lakhishako.

Future ma:

- Gemini suggest kari shake

Current use:

- caption draft store karva
- final text manage karva

#### 8. `IG Media ID`

Aa Instagram side nu media id chhe.

Use:

- analytics mate
- live post ne track karva

Usually posting pachi attach karvanu.

#### 9. `Likes / Reach`

Aa performance metrics chhe.

Use:

- post ketli perform kari rahi chhe e jovu
- likes and reach manually/automation thi update thai shake

## 4.4 Queue Detail Page

Aa page ek specific file ni full detail mate chhe.

Aa page par:

- file preview
- metadata cards
- editable planning fields
- related group files

Use:

- file open kari ne preview sathe decision levu
- schedule set karvu
- caption/editing karvu
- group ni biji files joi shakvu

### Detail Page Ma Shu Dekhase

- file preview
- drive file id
- folder
- status
- post type
- group id
- scheduled time
- ig media id
- likes/reach

### Related Files Section

Jo same `Group ID` hoi, to detail page niche related files dekhase.

Aa thi carousel set nu full group samajva easy thai jai chhe.

## 4.5 Businesses Page

Aa page tenant/business management mate chhe.

Use:

- business create karvi
- business members add karva
- admin/user roles assign karva
- admin/user mate password set karvu

Important:

- first business `super_admin` create kare
- pachi business admin add kare

## 4.6 Integrations Page

Aa page integrations mate chhe.

Current use:

- Instagram account records manage karva
- Google Drive connection records jovu

Note:

- real Instagram publishing haju scaffold state ma chhe
- Google Drive browser/connect flow main use mate Drive Browser page par lai gayo chhe

## 4.7 Analytics Page

Aa page current phase ma basic analytics mate chhe.

Use:

- likes snapshots jovu
- performance data store/check karvu

Future ma aa page expand kari shakay:

- reach trends
- best posting time
- account wise insights

## 5. Kai Field Ma Su Attach / Fill Karvu

Aa section quick reference mate chhe.

### Import Time

System attach kare chhe:

- file name
- drive file id
- folder id
- folder name
- preview url
- source
- media type

### Queue Planning Time

Team manually bhare:

- status
- group id
- post type
- scheduled time
- ai caption / final caption draft
- ig media id
- likes
- reach
- admin/user create karta vakhat password

### Carousel Mate

Manual attach:

- same `Group ID`

Example:

- `summer-01`
- `summer-01`
- `summer-01`

Aa tran rows ek group thai jase.

## 6. Recommended Real Workflow

Best practical workflow:

1. Admin business select kare
2. Drive Browser ma jai
3. Correct folder open kare
4. File preview kare
5. Relevant files queue ma import kare
6. Queue page ma jai
7. Group ID set kare
8. Post Type check kare
9. Scheduled Time set kare
10. Caption draft lakhhe
11. Detail page ma jai ne preview sathe final check kare
12. Publish/schedule process chalave

## 7. Common Examples

### Example A: Single Photo Post

Row ma:

- File Name: `offer-banner.jpg`
- Status: `scheduled`
- Group ID: blank
- Post Type: `single`
- Scheduled Time: `2026-04-25 11:00`
- AI Caption: promo caption

### Example B: Carousel Post

3 images hoi:

- image1 -> group `101`
- image2 -> group `101`
- image3 -> group `101`

Badha ma:

- Post Type: `carousel`

### Example C: Video Post

Video row ma:

- Post Type: `video`
- Group ID: blank

## 8. What Is Still Pending

Aa workflow no UI and structure ready chhe, pan aa items haju baki chhe:

1. Real Instagram Graph API publishing
2. full automatic scheduler worker
3. real Gemini caption generation integration
4. stronger permission restrictions in UI
5. richer analytics automation

## 9. Simple Rule Yaad Rakho

Short ma:

- `Drive Browser` = file shodhva ane import karva
- `Content Queue` = planning and scheduling table
- `Queue Detail` = ek file ni deep detail and preview
- `Businesses` = user/business manage karva
- `Integrations` = account connections
- `Analytics` = performance data

## 10. Jo Tame Navo User Hoi To

Simple start:

1. login
2. business select
3. Drive Browser kholo
4. folder kholo
5. file import karo
6. Queue kholo
7. group/schedule/caption bharo
8. detail page ma open kari final check karo

Aa guide ne app use karti vakhat sathe reference tarike use kari shako.

## 11. Auth Flow Short Version

Short auth flow:

1. `super_admin` only `/setup` thi create thay
2. `super_admin`, `admin`, `user` badha same `/login` page use kare
3. `admin` ane `user` `Businesses` page thi create thay
4. member create karta vakhat email + password set karvu jaruri chhe
5. login pachi role-wise access male chhe
