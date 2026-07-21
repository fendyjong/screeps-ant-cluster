import { log } from '../console/log';
import { printRoomName } from '../utilities/utils';
import { Visualizer } from '../visuals/Visualizer';
export var NotifierPriority;
(function (NotifierPriority) {
    NotifierPriority[NotifierPriority["SystemUpdate"] = -1] = "SystemUpdate";
    NotifierPriority[NotifierPriority["Critical"] = 0] = "Critical";
    NotifierPriority[NotifierPriority["High"] = 1] = "High";
    NotifierPriority[NotifierPriority["Normal"] = 2] = "Normal";
    NotifierPriority[NotifierPriority["Low"] = 3] = "Low";
})(NotifierPriority || (NotifierPriority = {}));
/**
 * Records one-time and persistent notifications from various in-game events
 */
export class Notifier {
    constructor() {
        this.alerts = [];
        this.notifications = [];
    }
    clear() {
        this.alerts = [];
    }
    alert(message, roomName, priority = NotifierPriority.Normal) {
        // Register an alert to be displayed this in the notifications visual box
        const alert = { message, roomName, priority };
        this.alerts.push(alert);
    }
    // TODO: finish
    email(message, roomName, duration = 100, email = false) {
        log.alert(printRoomName(roomName) + ': ' + message);
    }
    // init() {
    //
    // }
    //
    // run() {
    //
    // }
    generateNotificationsList(links = false) {
        const sortedAlerts = _.sortBy(this.alerts, alert => alert.priority);
        return _.map(sortedAlerts, alert => {
            if (alert.roomName) {
                return (links ? printRoomName(alert.roomName) : alert.roomName) + ': ' + alert.message;
            }
            else {
                return alert.message;
            }
        });
    }
    visuals() {
        const notificationMessages = this.generateNotificationsList();
        Visualizer.drawNotifications(notificationMessages);
    }
}
