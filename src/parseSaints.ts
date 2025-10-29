import { Calendarium, LiturgicalClass, Sanctorum } from "./types";
import { CalendarBuilder } from "./parse";
import { eachLiturgicalClass } from "./utils";

// export function parseSaints(sanctorum: Sanctorum, calendarium: Calendarium) {
//   const calendarBuilder = new CalendarBuilder();

//   eachLiturgicalClass((liturgicalClass) => {
//     Object.entries(calendarium[liturgicalClass]).forEach(
//       ([date, dateValue]) => {
//         const [day, month] = date
//           .split("-")
//           .map((date) => Number.parseInt(date));
//         const saints = Array.isArray(dateValue) ? dateValue : [dateValue];

//         saints.reverse().forEach((saint) => {
//           const saintDetails = sanctorum[saint];
//           calendarBuilder.add(month!, day!, {
//             title: saint,
//             subtitle: saintDetails?.titles,
//             type: saintDetails?.type,
//             liturgicalClass: liturgicalClass as LiturgicalClass,
//             calendarType: saintDetails?.calendarType,
//           });
//         });
//       }
//     );
//   });

//   return calendarBuilder.result;
// }
