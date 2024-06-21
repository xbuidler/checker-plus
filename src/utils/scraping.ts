import { cpuUsage } from "process";
import { IRentInstance, IMetrics } from "../types";

interface HighchartsConfig {
  [key: string]: any;
}

function processData(data: string): Record<string, HighchartsConfig> {
  // Define the regular expression to match Highcharts.chart objects
  const regex = /Highcharts\.chart\('([^']+)',\s*(\{[\s\S]*?\})\)/g;
  let match: RegExpExecArray | null;
  const dictionary: Record<string, HighchartsConfig> = {};

  // Loop through all matches
  while ((match = regex.exec(data)) !== null) {
      const key = match[1];
      const value = match[2];

      // Parse the object string into an actual JavaScript object
      try {
          const parsedValue: HighchartsConfig = eval(`(${value})`);
          
          // Remove specified properties
          delete parsedValue.tooltip;
          delete parsedValue.plotOptions;
          delete parsedValue.credits;
          delete parsedValue.chart;
          delete parsedValue.title;

          dictionary[key] = parsedValue;
      } catch (e) {
          console.error(`Error parsing value for key ${key}:`, e);
      }
  }

  return dictionary;
}

export const extractSeriesData = (data: any): any => {
    const result: { [key: string]: any } = {};

    const seriesNameMapper: { [key: string]: string } = {
        'CPU': 'cpuUsage',
        'IOWait': 'IOwaitUsage',
        'Steal': 'stealUsage',
        'User': 'userUsage',
        'System': 'systemUsage',
        'RAM': 'ramUsage',
        'Swap': 'swapUsage',
        'Buffered': 'bufferedUsage',
        'Cached': 'cachedUsage',
        'In': 'networkIn',
        'Out': 'networkOut',
        'Disk': 'diskUsage'
    };

    for (let key in data) {
        if (data.hasOwnProperty(key)) {
            const chartData = data[key];
            const seriesArray = chartData.series;

            seriesArray.forEach((series: any) => {
                const seriesName = series.name;
                const mappedSeriesName = seriesNameMapper[seriesName] || seriesName;
                const seriesData = series.data;

                result[mappedSeriesName] = seriesData;
            });
        }
    }

    return result;
}



export const compareUnixTimestamps = (givenUnixTime: number): boolean => {
    // Get current time in milliseconds
    const currentTimeMillis = Date.now();

    // Get the current time as a Date object
    const currentTime = new Date(currentTimeMillis);

    // Get the offset in minutes for the local timezone
    const offsetMinutes = currentTime.getTimezoneOffset();

    // Adjust the current time to UTC+00:00
    const adjustedTime = new Date(currentTimeMillis + (offsetMinutes * 60 * 1000));

    // Set the seconds to 0
    adjustedTime.setSeconds(0);

    // Get the Unix timestamp (in seconds)
    const calculatedUnixTimestamp = Math.floor(adjustedTime.getTime() / 1000);

    // Compare the given Unix timestamp with the calculated Unix timestamp
    if (givenUnixTime === calculatedUnixTimestamp) {
        return false;
    } else {
        return true;
    }
}

export async function fetchVastAiInstances(): Promise<any> {
  const url = "https://console.vast.ai/api/v0/instances";
  var myHeaders = new Headers();
  myHeaders.append("Accept", "application/json");
  myHeaders.append("Authorization", "Bearer "+process.env.VASTAI_APIKEY);
  var requestOptions = {
    method: 'GET',
    headers: myHeaders,
  };

  try {
    const response = await fetch(url,requestOptions);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error fetching instances:', error);
    throw error;
  }
}

export const fetchTensordockInstance = async (): Promise<IRentInstance> => {
  const id = "99894b4dd500bf0af5a906eb8f85e1c3";
  const duration = "1440";
  const reqUrl = 'https://monitor.m.tensordock.com/auth.php';
  const reqParams = `m=69&tx=${id}&u=${duration}`;

  const headers = {
    'Host': 'monitor.m.tensordock.com',
    'Cookie': 'PHPSESSID=f28kd9e55ih3m5l9m39ddfq0pd; _fw_crm_v=b7c41f54-b64e-4a4d-90e6-664b0b4f623b',
    'Sec-Ch-Ua': '"Google Chrome";v="125", "Chromium";v="125", "Not.A/Brand";v="24"',
    'Accept': 'text/html, */*; q=0.01',
    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
    'X-Requested-With': 'XMLHttpRequest',
    'Sec-Ch-Ua-Mobile': '?0',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    'Sec-Ch-Ua-Platform': '"Windows"',
    'Origin': 'https://monitor.m.tensordock.com',
    'Sec-Fetch-Site': 'same-origin',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Dest': 'empty',
    'Referer': `https://monitor.m.tensordock.com/report/uptime/${id}/`,
    'Accept-Encoding': 'gzip, deflate',
    'Accept-Language': 'en-US,en;q=0.9',
    'Priority': 'u=1, i'
  };

  let instance: IRentInstance = {
    uuid: "",
    model: "",
    driverVersion: "",
    vBiosVersion: "",
    metrics: [],
  };

  return new Promise(async (resolve, reject) => {
    try {
      const response = await fetch(
        `${reqUrl}?${reqParams}`,
        {
          method: 'POST',
          headers: headers,
        }
      );
      const data = await response.text();
      const dictionary: Record<string, HighchartsConfig> = processData(data);
      const jsonResponse = extractSeriesData(dictionary);

      console.log(jsonResponse.cpuUsage[jsonResponse.cpuUsage.length-1])
      const vastAiResponse = await fetchVastAiInstances()

      instance.metrics = jsonResponse;

      instance.uuid = id;
      instance.model = vastAiResponse['instances'][0]['cpu_name'];;
      instance.driverVersion = vastAiResponse['instances'][0]['driver_version'];;
      instance.vBiosVersion = '0';

      instance.metrics = jsonResponse.cpuUsage.map((item: number[], index: number) => ({
        timestamp: item[0],
        gpuUtil: vastAiResponse['instances'][0]['gpu_util'],
        powerDraw: 0,
        fanSpeed: 0,
        temperature: vastAiResponse['instances'][0]['gpu_temp'],
        gpuClock: 0,
        memClock: 0,
        memAlloc: vastAiResponse['instances'][0]['gpu_util'],
        memUtil: jsonResponse.ramUsage[index][1] / 100,
        videoClock: 0,
        smClock: item[1] / 100,
        cpuUsage: item[1]
      }));
      return resolve(instance);
    } catch (e) {
      console.log(e);
      return reject(e);
    }
  });
}



export const fetchInstanceFordb = async (): Promise<IMetrics> => {
  const id = "99894b4dd500bf0af5a906eb8f85e1c3";
  const duration = "1440";
  const reqUrl = 'https://monitor.m.tensordock.com/auth.php';
  const reqParams = `m=69&tx=${id}&u=${duration}`;

  const headers = {
    'Host': 'monitor.m.tensordock.com',
    'Cookie': 'PHPSESSID=f28kd9e55ih3m5l9m39ddfq0pd; _fw_crm_v=b7c41f54-b64e-4a4d-90e6-664b0b4f623b',
    'Sec-Ch-Ua': '"Google Chrome";v="125", "Chromium";v="125", "Not.A/Brand";v="24"',
    'Accept': 'text/html, */*; q=0.01',
    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
    'X-Requested-With': 'XMLHttpRequest',
    'Sec-Ch-Ua-Mobile': '?0',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    'Sec-Ch-Ua-Platform': '"Windows"',
    'Origin': 'https://monitor.m.tensordock.com',
    'Sec-Fetch-Site': 'same-origin',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Dest': 'empty',
    'Referer': `https://monitor.m.tensordock.com/report/uptime/${id}/`,
    'Accept-Encoding': 'gzip, deflate',
    'Accept-Language': 'en-US,en;q=0.9',
    'Priority': 'u=1, i'
  };


  return new Promise(async (resolve, reject) => {
    try {
      const response = await fetch(
        `${reqUrl}?${reqParams}`,
        {
          method: 'POST',
          headers: headers,
        }
      );
      const data = await response.text();
      const dictionary: Record<string, HighchartsConfig> = processData(data);
      const jsonResponse = extractSeriesData(dictionary);

      const vastAiResponse = await fetchVastAiInstances()
      const tensordata = jsonResponse.cpuUsage[jsonResponse.cpuUsage.length-1]
      const memUtilized = jsonResponse.ramUsage[jsonResponse.cpuUsage.length-1][1] / 100

      let instance: IMetrics = {
        timestamp: tensordata[0],
        gpuUtil: vastAiResponse['instances'][0]['gpu_util'],
        powerDraw: 0,
        fanSpeed: 0,
        temperature: vastAiResponse['instances'][0]['gpu_temp'],
        gpuClock: 0,
        memClock: 0,
        memAlloc: vastAiResponse['instances'][0]['gpu_util'],
        memUtil: memUtilized,
        videoClock: 0,
        smClock: tensordata[1]/100,
        cpuUsage: tensordata[1]
        };

        console.log(jsonResponse.cpuUsage[jsonResponse.cpuUsage.length-1])

      return resolve(instance);
    } catch (e) {
      console.log(e);
      return reject(e);
    }
  });
}
