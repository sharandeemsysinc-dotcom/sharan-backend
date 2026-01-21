export const generateGoogleCalendarLink = (
    title: string,
    description: string,
    location: string,
    startTime: Date,
    endTime: Date
) => {
    const formatTime = (date: Date) => date.toISOString().replace(/-|:|\.\d\d\d/g, "");

    const start = formatTime(startTime);
    const end = formatTime(endTime);

    const details = encodeURIComponent(description);
    const text = encodeURIComponent(title);
    const loc = encodeURIComponent(location);

    return `https://www.google.com/calendar/render?action=TEMPLATE&text=${text}&dates=${start}/${end}&details=${details}&location=${loc}&sf=true&output=xml`;
};

export const generateICS = (
    title: string,
    description: string,
    location: string,
    startTime: Date,
    endTime: Date,
    attendeeEmail?: string
) => {
    const formatTime = (date: Date) => date.toISOString().replace(/-|:|\.\d\d\d/g, "");

    return `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Alfitt//Appointment//EN
BEGIN:VEVENT
UID:${Date.now()}@alfitt.com
DTSTAMP:${formatTime(new Date())}
DTSTART:${formatTime(startTime)}
DTEND:${formatTime(endTime)}
SUMMARY:${title}
DESCRIPTION:${description}
LOCATION:${location}
${attendeeEmail ? `ATTENDEE;CN=${attendeeEmail};RSVP=TRUE:mailto:${attendeeEmail}` : ''}
END:VEVENT
END:VCALENDAR`;
};
