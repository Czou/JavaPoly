import JavaClassWrapper from "./JavaClassWrapper";
import WrapperUtil from "./WrapperUtil";

class Wrapper {
  constructor() {
    // NOP
  }

  init(obj, methods, nonFinalFields, finalFields) {
    const wrapper = this;

    // Add method handlers
    for (const name of methods) {
      obj[name] = function() {
        return wrapper.runMethodWithJSReflection(name, Array.prototype.slice.call(arguments))
      };
    }

    function methodExists(name) {
      return methods.findIndex(n => n == name) >= 0;
    }

    // Add getters and setters for non-final fields
    for (const name of nonFinalFields) {
      if (!methodExists(name)) {
        Object.defineProperty(obj, name, {
          get: () => wrapper.getFieldWithJavaDispatching(name),
          set: (newValue) => { wrapper.setFieldWithJavaDispatching(name, newValue) }
        });
      }
    }

    // Add getters for final fields
    for (const name of finalFields) {
      if (!methodExists(name)) {
        Object.defineProperty(obj, name, {
          get: () => wrapper.getFieldWithJavaDispatching(name)
        });
      }
    }
  }

  reflect(jsObj) {
    return new Promise((resolve, reject) => {
      WrapperUtil.dispatchOnJVM(this.javapoly, 'REFLECT_JS_OBJECT', 0, [jsObj], resolve, reject);
    });
  }

  runMethodWithJSReflection(methodName, args) {
    const wrapper = this;
    const okToReflect = !wrapper.isReflectMethod(methodName);

    const wrappedArgPromises = args.map (e => {
      if (okToReflect && (typeof(e) === "object") && (!e._javaObj)) {
        return wrapper.reflect(e);
      } else {
        return Promise.resolve(e);
      }
    });

    return Promise.all(wrappedArgPromises).then((wrappedArgs) => {
      const resultPromise = wrapper.runMethodWithJavaDispatching(methodName, wrappedArgs);
      if (okToReflect) {
        return resultPromise.then(result => {
          if ((!!result) && (typeof(result) === "object") && (!!result._javaObj)) {
            const className = result._javaObj.getClass().className;
            if (className === "Lcom/javapoly/reflect/DoppioJSObject;" || className === "Lcom/javapoly/reflect/DoppioJSPrimitive;") {
              return result._javaObj["com/javapoly/reflect/DoppioJSValue/rawValue"];
            }
          }
          return result;
        });
      } else {
        return resultPromise;
      }
    });
  }
}

export default Wrapper;
