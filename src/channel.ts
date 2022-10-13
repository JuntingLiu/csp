/**
 * Channel
 * @Author: Junting
 * @Date: 2022-10-13 09:28:31
 * @Last Modified by: Junting
 * @Last Modified time: 2022-10-13 09:59:43
 */

import type { Channel, PopperOnResolver, ResolveValue } from "./types";

/**
 * UnbufferedChannel
 * @desc: 无缓冲区的 Channel，缓冲区大小为 0 的 channel，所以在 pop()/put() 会有阻塞。
 */
export class UnbufferedChannel<T> implements Channel<T> {
  // channel 关闭标志
  private _closed = false;
  // put/pop 方法调用操作集合
  putActions: { resolve: Function, reject: Function, ele: T }[] = [];
  popActions: PopperOnResolver<T>[] = [];
  // 订阅对象实体集合
  readyListener: { resolve: Function, i: UnbufferedChannel<T> }[] = [];

  /**
   * 预检，检查一个通道是否准备好被读取，它只在通道准备好后返回。
   */
  async ready(): Promise<UnbufferedChannel<T>> {
    if (this.putActions.length || this._closed) {
      return this
    } else {
      return new Promise((resolve) => {
        this.readyListener.push({ resolve, i: this });
      })
    }
  }

  put(ele: T): Promise<void> {
    if (this._closed) {
      throw new Error("Can't put on a closed channel.");
    }

    if (this.readyListener.length) {
      for (let { resolve, i } of this.readyListener) {
        resolve(i);
      }
      // 接收完重置
      this.readyListener = [];
    }

    // 无等待的 pop action
    if (this.popActions.length === 0) {
      return new Promise((resolve, reject) => {
        this.putActions.push({
          resolve,
          reject,
          ele
        });
      });
    } else {
      // 弹出一个，再推进一个。
      return new Promise(resolve => {
        const popAction = this.popActions.shift();

        if (popAction === undefined) {
          throw new Error("Must be a pending pop action.")
        }
        popAction({ value: ele, done: false });
        resolve();
      })
    }
  }

  async pop(): Promise<T | undefined> {
    const next = await this.next();
    return next.value;
  }

  next(): Promise<ResolveValue<T>> {
    if (this._closed) {
      return Promise.resolve({ value: undefined, done: true });
    }

    if (this.putActions.length === 0) {
      return new Promise((resolve, reject) => {
        this.popActions.push(resolve);
      })
    } else {
      return new Promise(resolve => {
        const putAction = this.putActions.shift();

        if (putAction === undefined) {
          throw new Error("Must be a pending put action.");
        }
        const { resolve: resolver, ele } = putAction;
        resolve({ value: ele, done: false });
        resolver();
      })
    }
  }

  /**
   * channel 关闭：
   * 1、关闭一个已关闭的通道，抛出一个错误。
   * 2、put 一个封闭的通道中，会产生一个错误。
   * 2、一个封闭的通道中 pop 返回未定义。
   */
  async close(): Promise<void> {
    if (this._closed) {
      throw new Error("Current channel is closed.");
    }

    // 已封闭通道总是弹出一个 { value: undefined, done: true }
    for (let pendingPopper of this.popActions) {
      pendingPopper({ value: undefined, done: true });
    }
    this.popActions = [];

    // 已关闭的通道，已准备好随时弹出。
    for (let { resolve, i } of this.readyListener) {
      resolve(i)
    }
    this.readyListener = [];

    for (let pendingPutter of this.putActions) {
      pendingPutter.reject("A closed channel can never be put.");
    }
    this.putActions = [];

    this._closed = true;
  }

  closed(): boolean {
    return this._closed;
  }

  [Symbol.asyncIterator]() {
    return this;
  }

  return?(value?: any): Promise<IteratorResult<T, any>> {
    throw new Error("Method not implemented.");
  }
  throw?(e?: any): Promise<IteratorResult<T, any>> {
    throw new Error("Method not implemented.");
  }
}

// 为什么缩写名称为 chan？ 别问，问就是流行，哼 👻。
export function chan<T>() {
  return new UnbufferedChannel<T>();
}