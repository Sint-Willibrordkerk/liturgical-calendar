export const toKebabCase = (str) =>
  str?.trim().toLowerCase().replace(/\s+/g, "-");

export function maybeArrayEach(array, callback) {
  if (Array.isArray(array)) {
    for (const item of array) {
      callback(item);
    }
  } else {
    callback(array);
  }
}

export function traverseObject(object, callback, path = []) {
  for (const key in object) {
    const newPath = [...path, key];
    if (typeof object[key] === "object") {
      if (Array.isArray(object[key])) {
        object[key].forEach((item, i) => {
          if (typeof item === "object") {
            traverseObject(item, callback, newPath);
          } else {
            callback({
              key,
              value: item,
              parent: object,
              path: newPath,
              index: i,
            });
          }
        });
      } else {
        traverseObject(object[key], callback, newPath);
      }
    } else {
      callback({ key, value: object[key], parent: object, path: newPath });
    }
  }
}
