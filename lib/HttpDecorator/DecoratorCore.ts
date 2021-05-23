import axios, { AxiosRequestConfig, Method } from 'axios';
import 'reflect-metadata';
import {
  getDefaultRequestConfig,
  assignRequestConfig,
} from './RequestConfig';
import { isNumber, isObject } from './utils';
import {
  HEADER,
  PARAMS,
  PARAMS_INDEX,
  RESPONSE_INDEX,
  ERROR_INDEX,
} from './MetaSymbols';

const getMetaData = (target: Object, propertyKey: string | symbol) => {
  const { getOwnMetadata } = Reflect;
  const headers: Record<string, string | number> = getOwnMetadata(HEADER, target, propertyKey);
  const params: Record<string, any> = getOwnMetadata(PARAMS, target, propertyKey);
  const paramsIndex: number = getOwnMetadata(PARAMS_INDEX, target, propertyKey);
  const responseIndex: number = getOwnMetadata(RESPONSE_INDEX, target, propertyKey);
  const errorIndex: number = getOwnMetadata(ERROR_INDEX, target, propertyKey);
  return {
    headers,
    params,
    paramsIndex,
    responseIndex,
    errorIndex,
  };
};

const hasValidParamIndex = (index: number) => isNumber(index) && index >= 0;

const useDataField = (method: Method) => (['POST', 'PUT', 'PATCH'].includes(method));

export function HttpMethodDecoratorFactory(method: Method, url: string) {
  return function (target: Object, propertyKey: string | symbol, descriptor: PropertyDescriptor) {
    const rawMethod: (...args: unknown[]) => void = descriptor.value;
    descriptor.value = async function (...args: unknown[]) {
      const {
        headers,
        params = {},
        paramsIndex,
        responseIndex,
        errorIndex,
      } = getMetaData(target, propertyKey);

      // 取出默认的请求配置
      const requestConfig: AxiosRequestConfig = getDefaultRequestConfig();
      // 请求参数
      const requestParams = {
        ...params,
        ...(
          (hasValidParamIndex(paramsIndex) && isObject(args[paramsIndex]))
            ? args[paramsIndex] as Record<string, any>
            : {}
        ),
      };
      // 'POST' | 'PUT' | 'PATCH' 请求的参数放在 data 字段，'GET' 等请求放在 params 字段
      if (useDataField(method)) {
        assignRequestConfig(requestConfig, { data: requestParams });
      } else {
        assignRequestConfig(requestConfig, { params: requestParams });
      }

      // 加入 headers ，header 相同会覆盖
      if (headers) assignRequestConfig(requestConfig, { headers });

      requestConfig.url = url;
      requestConfig.method = method;

      try {
        const response = await axios(requestConfig);
        if (hasValidParamIndex(responseIndex)) {
          args[responseIndex] = response.data;
        }
      } catch (e: unknown) {
        // 错误捕获给 @Err 参数
        if (hasValidParamIndex(errorIndex)) {
          args[errorIndex] = e;
        }
      }

      return rawMethod.apply(this, args);
    };
  };
}

/**
 * 自定义请求方法装饰器
 * @param method 请求方法 |'get'|'post'|...|
 * @returns 方法装饰器
 * @example
 * ```
 * >|const Patch = createMethodDecorator('PATCH');
 * >|
 * >|@Patch('/foo/bar')
 * >|fetch() {}
 * ```
 */
export const createMethodDecorator = (method: Method) => {
  return function (url: string) {
    return HttpMethodDecoratorFactory(method, url);
  };
};
