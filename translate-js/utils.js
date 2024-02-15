import xml2js from 'xml2js';

const parseXML = async (xmlString) => {
  const parser = new xml2js.Parser();
  return parser.parseStringPromise(xmlString);
};

export const flattenXML = async (xmlString) => {
  const parsedXml = await parseXML(xmlString);
  let result = {};
  const style = ['u', 'b']
  const flatten = (obj, path = '') => {
    if (obj instanceof Array) {
      obj.forEach((item, index) => {
        flatten(item, `${path}[${index}]`);
      });
    } else if (typeof obj === 'object') {
      Object.keys(obj).forEach((key) => {
        if (key === 'string') {
          obj[key].forEach((item) => {
            const name = item.$.name;
            result[`${path}.${key}.${name}`] = item._ || '';
            style.forEach((s) => {
              if (item[s]) {
                item[s].forEach((u, index) => {
                  result[`${path}.${key}.${name}.${s}[${index}]`] = u || '';
                });
              }
            });
          });
        } else if (key === 'string-array') {
          obj[key].forEach((item) => {
            const name = item.$.name;
            item.item.forEach((subItem, index) => {
              result[`${path}.${key}.${name}[${index}]`] = subItem._ || '';
              style.forEach((s) => {
                if (subItem[s]) {
                  subItem[s].forEach((u, jndex) => {
                    result[`${path}.${key}.${name}[${index}].${s}[${jndex}]`] = u || '';
                  });
                }
              });
            });
          });
        } else if (key === 'plurals') {
          obj[key].forEach((item) => {
            const name = item.$.name;
            item.item.forEach((subItem) => {
              const quantity = subItem.$.quantity;
              result[`${path}.${key}.${name}.${quantity}`] = subItem._ || '';
              style.forEach((s) => {
                if (subItem[s]) {
                  subItem[s].forEach((u, index) => {
                    result[`${path}.${key}.${name}.${quantity}.${s}[${index}]`] = u || '';
                  });
                }
              });
            });
          });
        } else {
          flatten(obj[key], path ? `${path}.${key}` : key);
        }
      });
    }
  };

  flatten(parsedXml);
  return { result, parsedXml };
};

const buildXML = async (jsObj) => {
  const builder = new xml2js.Builder();
  return builder.buildObject(jsObj);
};

export const inflateXML = async (result, parsedXml) => {
  const style = ['u', 'b']
  const inflate = (obj, path = '') => {
    if (obj instanceof Array) {
      obj.forEach((item, index) => {
        inflate(item, `${path}[${index}]`);
      });
    } else if (typeof obj === 'object') {
      Object.keys(obj).forEach((key) => {
        if (key === 'string') {
          obj[key].forEach((item) => {
            const name = item.$.name;
            item._ = result[`${path}.${key}.${name}`];
            style.forEach((s) => {
              if (item[s]) {
                item[s].forEach((_, index) => {
                  item[s] = result[`${path}.${key}.${name}.${s}[${index}]`];
                });
              }
            });
          });
        } else if (key === 'string-array') {
          obj[key].forEach((item) => {
            const name = item.$.name;
            item.item.forEach((subItem, index) => {
              subItem._ = result[`${path}.${key}.${name}[${index}]`];
              style.forEach((s) => {
                if (subItem[s]) {
                  subItem[s].forEach((_, jndex) => {
                    subItem[s] = result[`${path}.${key}.${name}[${index}].${s}[${jndex}]`];
                  });
                }
              });
            });
          });
        } else if (key === 'plurals') {
          obj[key].forEach((item) => {
            const name = item.$.name;
            item.item.forEach((subItem) => {
              const quantity = subItem.$.quantity;
              subItem._ = result[`${path}.${key}.${name}.${quantity}`];
              style.forEach((s) => {
                if (subItem[s]) {
                  subItem[s].forEach((_, index) => {
                    subItem[s] = result[`${path}.${key}.${name}.${quantity}.${s}[${index}]`];
                  });
                }
              });
            });
          });
        } else {
          inflate(obj[key], path ? `${path}.${key}` : key);
        }
      });
    }
  };

  inflate(parsedXml);
  return buildXML(parsedXml);
};



export const flattenJSON = (data, prefix = '') => {
  let result = {};
  if (Array.isArray(data)) {
    data.forEach((value, index) => {
      const newKey = `${prefix}.[${index}]`;
      if (typeof value === 'object' && value !== null) {
        result = { ...result, ...flattenJSON(value, newKey) };
      } else {
        result[newKey] = value;
      }
    });
  } else {
    for (let key in data) {
      const escapedKey = key.replace(/\[/g, '\\[').replace(/\]/g, '\\]');
      const newKey = prefix ? `${prefix}.${escapedKey}` : escapedKey;
      const value = data[key];
      if (typeof value === 'object' && value !== null) {
        result = { ...result, ...flattenJSON(value, newKey) };
      } else {
        result[newKey] = value;
      }
    }
  }
  return result;
};

export const inflateJSON = (data) => {
  let result = {};
  for (let key in data) {
    let value = data[key];
    let keys = key.split('.').map(k => k.replace(/\\[\[\]]/g, match => match[1]));
    let temp = result;
    for (let i = 0; i < keys.length; i++) {
      let nextKey = keys[i];
      let isArrayIndex = /^\[\d+\]$/.test(nextKey);
      let actualKey = isArrayIndex ? parseInt(nextKey.match(/\[(\d+)\]/)[1], 10) : nextKey;
      let isLastElement = i === keys.length - 1;

      if (isArrayIndex && !Array.isArray(temp)) {
        temp = [];
      }

      if (isLastElement) {
        temp[actualKey] = value;
      } else {
        if (temp[actualKey] === undefined) {
          temp[actualKey] = /^\[\d+\]$/.test(keys[i + 1]) ? [] : {};
        }
        temp = temp[actualKey];
      }
    }
    result = Array.isArray(result) ? Object.values(result) : result;
  }
  return result;
};
// Chunking function
export function chunkArray(array, size) {
  const chunkedArray = [];
  for (let i = 0; i < array.length; i += size) {
    chunkedArray.push(array.slice(i, i + size));
  }
  return chunkedArray;
}

