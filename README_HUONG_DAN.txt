TRUNG TAM TOAN AN PHUC - LMS V1.2
Huong dan cai dat va kiem thu, ngay 19/11/2026

NOI DUNG DA LAM
- Cong chinh 3 vai tro: Phu huynh / Giao vien / Hoc sinh, giu phong cach giao dien goc.
- Hoc sinh tim ten => chon dung hoc sinh => nhap SDT phu huynh da dang ky (giong cong PH); khong can OTP, khong can ma de.
- Chi thay bai dung khoi, va neu bai giao theo lop thi dung lop.
- 3 cap do moi bai, 10 cau trac nghiem A-B-C-D/cap, 10 diem/cap, dat 6 diem mo cap tiep theo.
- Tu dong luu ban nhap tren trinh duyet, cham tren may chu, du lieu diem vao LMS_Results, PH xem trong bao cao da xac minh.
- Giao vien co tab LMS: tao/ket noi bank Google Sheets, nap Excel, danh dau trung va xung dot, tra cuu QuestionUID, tao/giao bai tu dong hoac chon dung 10 ID/cap, xem bang diem.
- Gia tri READY duoc phep giao. REVIEW/DUPLICATE khong duoc rut vao de.
- Chu y: khong da can thiep, khong xoa logic bang diem/diem danh/hoc phi/Zalo va cac module AI hien tai.

THU MUC
1. Frontend Vercel: index.html, lms.js, lms.css, vercel.json
2. Apps Script: Code.gs (ban goc chi them endpoint va ket qua LMS trong cong PH), Module_LMS.gs, Module_LMSBank.gs
3. Module_*.gs con lai la ban sao cac module goc nguoi dung cung cap (ten tep da bo hau to (2)/(3) de dan vao Apps Script).
4. AnPhuc_LMS_NganHang_ChuanHoa.xlsx: bank trac nghiem da gan QuestionUID.
5. ORIGINAL_Code.gs va ORIGINAL_index.html: ban sao luu truoc khi them LMS.
6. tests/smoke_lms.js: test gia lap API, khong dung du lieu ca nhan.

BUOC 1 - SAO LUU
- Tao ban sao Google Sheets trung tam, Apps Script hien hanh va repository GitHub/Vercel. KHONG xoa deployment cu.
- Cho hai file Module_LMS.gs va Module_LMSBank.gs vao CUNG project Apps Script dang dung.
- Thay noi dung Code.gs cua project bang file Code.gs moi trong bo nay; GIU NGUYEN cac module con lai, khong chay initSheets de ghi de du lieu.
- Neu project da co ten module khac hoac ma moi sau 19/11/2026, phai doi chieu va merge, khong ghi de tuy tien.

BUOC 2 - NGAN HANG
- Up file AnPhuc_LMS_NganHang_ChuanHoa.xlsx len Google Drive.
- Mo bang Google Trang tinh, chon Luu duoi dang Google Trang tinh (ban native, KHONG phai file XLSX xem thu).
- Sao chep ID (doan giua /d/ va /edit) cua bang tinh moi.
- Bank rieng phai chua sheet LMS_Questions voi cot QuestionUID Grade Chapter LMS_Level Question A B C D CorrectAnswer Status.
- Dua 261 cau danh dau REVIEW vao danh sach duyet, KHONG tu y doi thanh READY khi chua kiem tra dap an.

BUOC 3 - APPS SCRIPT
- Bam Save, Deploy > Manage deployments > Edit deployment Web app dang su dung > New version > Deploy.
- Viec Edit deployment dang dung giu URL /exec cu. Neu tao New deployment khac thi phai sua API_URL trong index.html.
- Bao dam deployment Web app su dung quyen phu hop voi Google Spreadsheet va co quyen truy cap tu trinh duyet hoc sinh.

BUOC 4 - GIAO DIEN
- Upload index.html, lms.js, lms.css va vercel.json len repository GitHub dang duoc Vercel theo doi.
- GIU lai logo.jpg va cac tep khac nhu hien tai. Bo nay khong kem logo.jpg vi ban goc chua duoc gui.
- Deploy Vercel. Neu co canh bao CSP, su dung vercel.json trong bo nay (da them domain Cloudinary cho anh cau hoi).
- Test ba cong: Phu huynh va Giao vien phai van hoat dong binh thuong.

BUOC 5 - KET NOI BANK
- Dang nhap tai cong Giao vien => tab LMS / Ngan hang de.
- Dan ID Google Trang tinh bank o buoc 2, bam Ket noi ngan hang co san.
- KHONG bam Tao ngan hang moi neu da chuan bi bang tinh rieng.
- Neu muon nap them cau hoi moi, su dung chuc nang Nap file Excel; khong dong tab den khi hoan tat.
- Bam Quet trung va xung dot; he thong danh dau DUPLICATE/REVIEW va luu log, khong xoa du lieu goc.

BUOC 6 - GIAO BAI
- Chon khoi, chuong, lop (de trong = ca khoi), ten bai, han nop tuy chon.
- Khoi-chuong du 10 cau READY moi cap cho phep Tao va giao bai tu dong.
- Neu chon theo ID: chon "Tao theo ID (nhieu chuong)", nhap DUNG 10 QuestionUID moi cap, hoac tra cuu ID tai buoc 4 va bam Chon ID. Khong can ma de.
- Nhan Tao va giao bai. He thong tao SAN 3 goi cau, de HS mo bai nhanh va khong phai doc lai hang ngan cau trong bank.

BUOC 7 - HOC SINH
- Tai cong chinh chon Hoc sinh => tim ten, bam ten/lop dung trong goi y => nhap 10 so dien thoai PH da dang ky => Vao hoc.
- Chon bai da giao: he thong bat dau cap do dang mo, moi cap 10 cau 10 diem.
- Tu 6 diem mo cap tiep theo. Co the lam lai de cai thien diem; bao cao lay diem cao nhat moi cap.
- Neu khong duoc giao bai, danh sach hien trang thai trong.

BUOC 8 - KIEM THU TRUOC KHI MO RONG
- Test 1 hoc sinh dong ca 3 cap va xem diem tren cong PH (tra cuu/xac minh SDT).
- Test khong co bai, bai sai khoi/lop, cau REVIEW, trung ID, nop lai cung attempt, mat mang luc nop, reload de phuc hoi ban nhap.
- Sau do test 5, 20, 40 HS that. Do thoi gian tai de, nop bai, so lan bi bao loi/timeout va do chinh xac du lieu Sheet.
- Chua co ket qua kiem thu tai tren Apps Script thuc te; KHONG coi moc 40 HS la da bao dam tuyet doi. Neu nhieu HS nop cung luc hay bi timeout, can nang cap luu tru LMS hoac chuyen sang DB.

BAO MAT
- Dang nhap bang SDT PH theo yeu cau de su dung, khong phai bao mat manh nhu OTP/PIN rieng.
- Co gioi han so lan doan SDT, token he thong quan ly theo tung hoc sinh; frontend khong nhan dap an truoc khi nop.
- Khuyen nghi sau khi van hanh on dinh, co the bat buoc PIN hoc sinh de tang bao mat.
- Không chia se cong khai file Code.gs, URL bang tinh quan ly, danh sach SDT, PIN hay du lieu hoc sinh.

GHI CHU
- Thu nghiem hien tai: kiem tra cu phap JS/GAS, cau truc HTML, mo phong dang nhap, goi de, 3 lan nop va ket qua PH. Chua ket noi duoc Google Sheets thuc te vi chua co quyen truy cap du lieu song.
