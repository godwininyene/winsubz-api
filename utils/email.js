const nodemailer = require('nodemailer');
const pug = require('pug');
const { convert } = require('html-to-text');

module.exports = class Email {
    constructor(user, url, type) {
        this.to = user.email;
        this.from = `Winsubz <${process.env.EMAIL_FROM}>`;
        this.firstName = user.firstName;
        this.url = url;
        this.type = type
    }

    newTransport() {
        // if (process.env.NODE_ENV === 'production') {
        //     // Using Gmail service
        //     return nodemailer.createTransport({
        //         service: "Gmail",
        //         auth: {
        //             user: process.env.GMAIL_USERNAME,
        //             pass: process.env.GMAIL_PASS
        //         }
        //     })
        // }

        if (process.env.NODE_ENV === 'production') {
            return nodemailer.createTransport({
                host: process.env.EMAIL_HOST,
                port: process.env.EMAIL_PORT,
                secure: true,
                auth: {
                    user: process.env.EMAIL_USER,
                    pass: process.env.EMAIL_PASSWORD,
                },
            });
        }
    }

    async send(template, subject, templateData = {}) {
        // 1) Render the HTML base on the pug template
        const html = pug.renderFile(`${__dirname}/../views/email/${template}.pug`, {
            firstName: this.firstName,
            url: this.url,
            type: this.type,
            ...templateData
        })
        //2) Define email options
        const mailOptions = {
            from: this.from,
            to: this.to,
            subject,
            html,
            text: convert(html, {
                wordwrap: 130,       // Better formatting for plain text
                selectors: [
                    { selector: 'a', options: { ignoreHref: true } }, // Cleaner links
                    { selector: 'img', format: 'skip' }               // Skip images in text
                ]
            })
        }
        // 3) Create a transport and send email
        await this.newTransport().sendMail(mailOptions)
    }


    async sendTransaction(transactionData) {
        await this.send('transaction', 'Transaction Notice', transactionData)
    }
    async sendOnBoard() {
        await this.send("welcome", "Account Approval Status")
    }

    async sendTransactionAdmin(transactionData) {
        await this.send('transactionAdmin', 'Transaction Notice', transactionData)
    }

    async sendPasswordReset() {
        await this.send('passwordReset', 'Your password reset token (valid for only 15 minutes)');
    }
}