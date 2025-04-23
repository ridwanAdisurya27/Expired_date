const express = require('express');
const axios = require('axios');
const {google} = require("googleapis");
const bodyParser = require("body-parser");
const keys = require("./credentials.json");
const app = express();
const PORT = 3000;
const spreadsheetId = "1FoFKjs65XJnmatbUqRPm-PMvmJJqVkkXOa9do6f_yeo";
const process = require('dotenv').config();

app.use(express.json());
app.use(bodyParser.json());

// Auth Google
const auth = new google.auth.GoogleAuth({
    credentials: keys,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});

// ROUTE TEST
app.get('/', (req, res) => {
    res.send('WhatsApp Reminder API is running!');
});

// ROUTE UNTUK KIRIM PESAN
app.post('/send-message', async (req, res) => {
    const {
        product,
        date
    } = req.body;

    try {
        const response = await axios.post(
            'https://graph.facebook.com/v22.0/640708259121704/messages', {
                messaging_product: 'whatsapp',
                to: 6283857206242,
                type: 'template',
                template: {
                    name: 'pengingat_product',
                    language: {
                        code: 'id'
                    },
                    components: [{
                        type: 'body',
                        parameters: [{
                                type: 'text',
                                parameter_name: 'no_product',
                                text: product
                            },
                            {
                                type: 'text',
                                parameter_name: 'tgl',
                                text: date
                            }
                        ]
                    }]
                }
            }, {
                headers: {
                    Authorization: `Bearer ${process.env.WA_TOKEN}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        res.status(200).json({
            success: true,
            response: response.data
        });
    } catch (error) {
        console.error(error.response?.data || error.message);
        res.status(500).json({
            success: false,
            error: error.response?.data || error.message
        });
    }
});

app.post("/produk", async (req, res) => {
    const client = await auth.getClient();
    const timestamp = new Date().toLocaleString("id-ID", {
        dateStyle: "short",
        timeStyle: "medium"
    });
    const sheets = google.sheets({
        version: "v4",
        auth: client
    });

    const {
        nama,
        tanggal,
    } = req.body;

    await sheets.spreadsheets.values.append({
        spreadsheetId,
        range: "Sheet1!A:C",
        valueInputOption: "RAW",
        requestBody: {
            values: [
                [timestamp, nama, tanggal]
            ],
        },
    });

    res.send("Data produk ditambahkan!");
});

app.get("/cek-expired", async (req, res) => {
    const client = await auth.getClient();
    const nomor = 6283857206242;
    const sheets = google.sheets({ version: "v4", auth: client });

    // Formatting today to yyyy-mm-dd
    function formatDate(date) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0'); // getMonth() starts from 0
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`; // Output: YYYY-MM-DD
    }

    const result = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: "Sheet1!A:D", // pastikan kolom D berisi nomor HP
    });

    const rows = result.data.values;

    if (!rows || rows.length === 0) {
        return res.send("Tidak ada data produk.");
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let dikirim = [];

    for (let i = 0; i < rows.length; i++) {
        const [dump, ID, nama, tanggal] = rows[i];
        console.log(`Cek: ${ID}, nama: ${nama}, tgl:${tanggal}, today:${formatDate(today)}`);

        const targetDate = new Date(tanggal);
        const twoWeeksBefore = new Date(targetDate);
        twoWeeksBefore.setDate(targetDate.getDate() - 14);

        if (formatDate(twoWeeksBefore) === formatDate(today)) {
            try {
                await axios.post(
                    'https://graph.facebook.com/v22.0/640708259121704/messages',
                    {
                        messaging_product: 'whatsapp',
                        to: nomor,
                        type: 'template',
                        template: {
                            name: 'pengingat_product',
                            language: { code: 'id' },
                            components: [{
                                type: 'body',
                                parameters: [{
                                    type: 'text',
                                    parameter_name: 'no_product',
                                    text: nama
                                },
                                {
                                    type: 'text',
                                    parameter_name: 'tgl',
                                    text: tanggal
                                }
                            ]
                            }]
                        }
                    },
                    {
                        headers: {
                            Authorization: `Bearer EAAJHdMurKMEBOxNZASF57oPTuBQWUfhYNGj28LxZBjvEZBnb8ZB5SlC54mMJ7ySihTAAWxse1dNQy8xz6AbQVAaERLsmHhZAdAthl1clq3Jsb3LXJeotLZA0OZBGDtzDFW5kxZBaqHUmtFlu3sfcoSBKu8q7j7bPZC2lDpWmYIjkQY0q4dN7dAj6R1f7efMdlIFUUZAKBl3ZALVjVzuDIUeBuDjMNto5ZBkZD`,
                            'Content-Type': 'application/json'
                        }
                    }
                );
                dikirim.push({ nama, nomor });
            } catch (error) {
                console.error("Gagal kirim:", nama, error.response?.data || error.message);
            }
        }
    }

    res.json({
        status: "Selesai dicek",
        jumlah_dikirim: dikirim.length,
        detail: dikirim
    });
});

app.post('/webhook', async (req, res) => {
    const body = req.body;

    // Cek kalau ada pesan masuk dari WhatsApp
    if (body.object) {
        if (
            body.entry &&
            body.entry[0].changes &&
            body.entry[0].changes[0].value.messages &&
            body.entry[0].changes[0].value.messages[0]
        ) {
            const message = body.entry[0].changes[0].value.messages[0];
            const from = message.from; // Nomor pengirim
            const msgBody = message.text?.body || ''; // Isi pesan

            console.log(`Pesan masuk dari ${from}: ${msgBody}`);

            // Kirim template selamat datang
            await sendWelcomeTemplate(from);
        }

        res.sendStatus(200);
    } else {
        res.sendStatus(404);
    }
});

async function sendWelcomeTemplate(number) {
    try {
        await axios.post(
            'https://graph.facebook.com/v22.0/640708259121704/messages',
            {
                messaging_product: 'whatsapp',
                to: number,
                type: 'template',
                template : {
                    name : "alert_message_expired_date",
                    language : {
                        code : "id"
                    }
                }
            },
            {
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        console.log(" Template selamat datang terkirim!");
    } catch (error) {
        console.error(" Gagal kirim template:", error.response?.data || error.message);
    }
}


const cron = require("node-cron");

// Jalankan setiap jam 8 pagi
cron.schedule('0 8 * * *', async () => {
    console.log("Cek produk expired otomatis...");
    await axios.get("http://localhost:3000/cek-expired");
});

app.listen(PORT, () => {
    console.log(`Server berjalan di http://localhost:${PORT}`);
});