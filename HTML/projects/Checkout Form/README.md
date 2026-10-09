# Checkout Form: orders straight to your email

A plain HTML checkout page. When a customer clicks **Place order**, the order is
emailed to you by [FormSubmit](https://formsubmit.co). No backend, no account, no API key.

Watch it first: **[checkout-form-formsubmit.mp4](checkout-form-formsubmit.mp4)** (2.5 minutes).

---

## Set up FormSubmit (5 steps)

### 1. Get an email address

Use your own email, or a temporary one for practice:

- Open **[temp-mail.org/en](https://temp-mail.org/en/)**.
- It gives you an address straight away. Click **Copy**.
- Keep that tab open. The emails will show up there.

### 2. Put the email in `action`

In `index.html`, find the form tag and replace `your-email@example.com` with your email:

```html
<form action="https://formsubmit.co/your-email@example.com" method="POST">
```

Select `your-email@example.com`, paste the address you copied (Ctrl + V), and nothing else
changes: `https://formsubmit.co/` stays in front of it, and `method="POST"` must stay. Save the file.

### 3. Give every input a `name`

FormSubmit only sends inputs that have a `name`. The name is the label you see in the email:

```html
<input type="text" name="Customer">
<input type="tel"  name="Phone">
<textarea name="Address"></textarea>
```

Use `name="email"` for the customer's email: FormSubmit then lets you reply to the customer directly.
Use one word or join words: a name with a space becomes `Deliver_to` in the email.

### 4. Add the hidden settings (optional, but nicer)

```html
<input type="hidden" name="_subject"  value="New order #MS-1024 - Rs 22,500">
<input type="hidden" name="_template" value="table">
<input type="hidden" name="_captcha"  value="false">
```

| name | what it does |
|---|---|
| `_subject` | the subject line of the email |
| `_template` | `table` puts everything in a neat table |
| `_captcha` | `false` skips the "I'm not a robot" page |

**The order as a receipt.** A hidden `textarea` named `Order` carries the bill. FormSubmit shows
values in a fixed-width font, so columns lined up with spaces look like a real receipt. Write the
receipt at the very start of the line, because spaces before it end up in the email too.

### 5. Open with Live Server, place one order, activate

1. Right-click `index.html` → **Open with Live Server** (`http://127.0.0.1:5500/...`).
   **Double-clicking the file does not work**: FormSubmit needs a page that runs on a server.
2. Fill the form and click **Place order**. FormSubmit shows **"Check Your Email"**.
3. Go to your inbox (the temp-mail tab). Open **"Action Required: Activate FormSubmit"** and click **ACTIVATE FORM**.
4. Done. You only do this **once per email address**. From now on every order arrives as
   **"New order #MS-1024 - Rs 22,500"**. The first order you placed is sent too, right after activation.

---

## When it does not work

| what you see | why, and what to do |
|---|---|
| Nothing in the inbox | Wait a minute and press **Refresh**. Check spam if you used your own email. |
| "Check Your Email" every time | The form is not activated yet. Click **ACTIVATE FORM** in the email (step 5). |
| A field is missing in the email | That input has no `name="..."`. |
| Error or blank page after Place order | You opened the file by double-clicking. Use Live Server. |
| You changed the email in `action` | A new email needs its own activation. Do step 5 again. |

**Temp mail is for practice only.** The address and its emails disappear after a while. For a real
shop, put your own email in `action`.

Photos: Alejandro Escamilla, Pawel Kadysz, Nicola Perantoni on Unsplash.
