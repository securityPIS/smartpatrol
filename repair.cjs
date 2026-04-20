const fs = require('fs');
let content = fs.readFileSync('c:/dev/SmartPatrol/src/context/AppContextRuntime.jsx', 'utf8');

const targetFunction1 = `function mergeEntitiesById(baseItems = [], nextItems = [], options = {}) {
  const {
    getId = (item) => item?.id,
    merge = (baseItem, nextItem) => ({ ...baseItem, ...nextItem }),
  } = options;
  const merged = new Map();

  [...baseItems, ...nextItems].forEach((item) => {
    const itemId = getId(item);
    if (!itemId) return;
    const existingItem = merged.get(itemId);
    merged.set(itemId, existingItem ? merge(existingItem, item) : item);
  });

  return Array.from(merged.values());
}
`;

const targetFunction2 = `
function mergeIncidentMetaCollection(baseMeta = {}, nextMeta = {}) {
  const mergedMeta = { ...(baseMeta || {}) };

  Object.entries(nextMeta || {}).forEach(([incidentId, nextValue]) => {
    const baseValue = mergedMeta[incidentId] || {};
    mergedMeta[incidentId] = {
      ...baseValue,
      ...nextValue,
      documentation: mergeDocumentationItems(baseValue.documentation || [], nextValue?.documentation || []),
      progress: mergeProgressItems(baseValue.progress || [], nextValue?.progress || []),
    };
  });

  return mergedMeta;
}
`;

const targetFunction3 = `
function mergeIncidentsCollection(baseIncidents = [], nextIncidents = []) {
  return mergeEntitiesById(baseIncidents, nextIncidents, {
    merge: (baseIncident, nextIncident) => (
      getIncidentSortTimestamp(nextIncident) >= getIncidentSortTimestamp(baseIncident)
        ? { ...baseIncident, ...nextIncident }
        : { ...nextIncident, ...baseIncident }
    ),
  }).sort((left, right) => getIncidentSortTimestamp(right) - getIncidentSortTimestamp(left));
}`;

const splitToken = 'function mergeNotificationsCollection';
const parts = content.split(splitToken);
if (parts.length > 1) {
  const firstHalf = parts[0];
  const secondHalf = splitToken + parts[1];
  
  const split2 = 'function createDeletedRecordsState';
  const parts2 = secondHalf.split(split2);
  
  const newContent = firstHalf + `function mergeNotificationsCollection(baseNotifications = [], nextNotifications = []) {
  const merged = new Map();

  [...baseNotifications, ...nextNotifications].forEach((notification) => {
    const mergeKey = getNotificationMergeKey(notification);
    if (!mergeKey) return;
    const existingNotification = merged.get(mergeKey);
    merged.set(mergeKey, mergeNotificationRecord(existingNotification, notification));
  });

  return sortNotifications(Array.from(merged.values()));
}

` + targetFunction1 + targetFunction2 + targetFunction3 + `

` + split2 + parts2[1];

  fs.writeFileSync('c:/dev/SmartPatrol/src/context/AppContextRuntime.jsx', newContent, 'utf8');
  console.log('Fixed successfully!');
} else {
  console.log('Failed to find split token');
}
