import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";

const sesClient = new SESClient({
  region: process.env.AWS_SES_REGION!,
  credentials: {
    accessKeyId: process.env.AWS_SES_ACCESS_KEY!,
    secretAccessKey: process.env.AWS_SES_SECRET_KEY!,
  },
});

interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export async function sendEmail(options: EmailOptions) {
  const params = {
    Source: process.env.SES_FROM_EMAIL!, // Must be verified email in SES
    Destination: {
      ToAddresses: [options.to],
    },
    Message: {
      Subject: {
        Charset: "UTF-8",
        Data: options.subject,
      },
      Body: {
        Html: {
          Charset: "UTF-8",
          Data: options.html,
        },
        Text: {
          Charset: "UTF-8",
          Data: options.text || "You have a new message.",
        },
      },
    },
  };

  try {
    const command = new SendEmailCommand(params);
    const response = await sesClient.send(command);

    const success = response.$metadata.httpStatusCode === 200;

    return {
      success,
      message: "Email accepted by AWS SES",
      smtp_status: success ? "250 OK" : "550 FAILED",
      messageId: response.MessageId,
      httpStatus: response.$metadata.httpStatusCode,
    };
  } catch (error: any) {
    return {
      success: false,
      message: "Email sending failed",
      smtp_status: "550 FAILED",
      error: error.message,
    };
  }
}
