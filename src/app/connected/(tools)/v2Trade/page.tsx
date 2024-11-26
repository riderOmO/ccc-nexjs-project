"use client";

import React, { useState, useEffect } from "react";
import { TextInput } from "../../../components/Input";
import { Button } from "../../../components/Button";
import { ccc } from "@ckb-ccc/connector-react";
import { useGetExplorerLink } from "../../../utils";
import { useApp } from "../../../context";
import { ButtonsPanel } from "../../../components/ButtonsPanel";
import { udtBalanceFrom } from "@ckb-ccc/connector-react";

const TOTAL_XUDT_SUPPLY = BigInt(800_000_000) * BigInt(100_000_000);

function getPrice(currentXudtAmount:bigint, xudtAmount:bigint) {
    // console.log("currentXudtAmount", currentXudtAmount);
    // console.log("xudtAmount", xudtAmount);
    currentXudtAmount = currentXudtAmount / BigInt(100_000_000);
    xudtAmount = xudtAmount / BigInt(100_000_000);
    const dg = BigInt(131500000000000)
    const uint128_400_000_000 = BigInt(100000000);
    const uint128_1 = BigInt(1);
    const uint128_2 = BigInt(2);

    const sum1 = (currentXudtAmount + uint128_400_000_000 - uint128_1) *
                 (currentXudtAmount + uint128_400_000_000) / dg *
                 (uint128_2 * (currentXudtAmount + uint128_400_000_000) - uint128_1);
    const sum2 = (currentXudtAmount + uint128_400_000_000 + xudtAmount - uint128_1) *
                 (currentXudtAmount + uint128_400_000_000 + xudtAmount)/ dg *
                 (uint128_2 * (currentXudtAmount + uint128_400_000_000) + uint128_2 * xudtAmount - uint128_1);
    // console.log("sum1", sum1);
    // console.log("sum2", sum2);
    const summation = sum2 - sum1;
    return summation;
}

function getBuyPriceAfterFee(currentXudtAmount:bigint, xudtAmount:bigint) {
    const price = getPrice(currentXudtAmount, xudtAmount);
    const fee = price * BigInt(500) / BigInt(10_000);
    return price + fee;
}

function getSellPriceAfterFee(currentXudtAmount:bigint, xudtAmount:bigint) {
    const price = getPrice(currentXudtAmount-xudtAmount,xudtAmount );
    const fee = price * BigInt(500) / BigInt(10_000);
    return price - fee;
}
function findAmount(
  supply: bigint,
  targetSummation: bigint,
  maxIterations: number = 10000,
  action: 'buy' | 'sell' = 'sell'
): bigint | null {
  let low = BigInt(0); // 都是指xudt的数量
  let high = BigInt(2*800_000_000 * 100_000_000); // 设定一个较大的初始上界
  let iterations = 0;
  let bestMid: bigint | null = null;
  let bestDifference = targetSummation; // 初始为最大可能的差值

  while (low <= high && iterations < maxIterations) {
      const mid = (low + high) / BigInt(2);

      let currentSummation: bigint;
      if (action === 'buy') {
          currentSummation = getBuyPriceAfterFee(supply, mid);
      } else if (action === 'sell') {
          currentSummation = getSellPriceAfterFee(supply, mid);
      } else {
          throw new Error("Action must be 'buy' or 'sell'");
      }

      const difference = targetSummation - currentSummation;

      if (currentSummation <= targetSummation) {
          if (bestMid === null || difference < bestDifference) {
              bestDifference = difference;
              bestMid = mid;
          }
      }

      if (currentSummation < targetSummation) {
          low = mid + BigInt(1);
      } else {
          high = mid - BigInt(1);
      }
      // console.log('currentSummation', currentSummation);
      iterations++;
  }

  // console.log('Max iterations reached', iterations);
  // console.log('Best mid', bestMid);
  return bestMid; // 返回最优解
}

function constructArgs(
  userPubkey: string,
  xudtArgs: string,
  slipPoint: number,
  desiredAmount: bigint
): string {
  // Helper function to decode a hex string to a byte array
  function hexToBytes(hex: string): Uint8Array {
      if (hex.startsWith('0x')) {
          hex = hex.slice(2);
      }
      const bytes = new Uint8Array(hex.length / 2);
      for (let i = 0; i < bytes.length; i++) {
          bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
      }
      return bytes;
  }

  // Helper function to convert a number to a byte array (big-endian)
  function numberToBytesBE(num: number, byteLength: number): Uint8Array {
      const bytes = new Uint8Array(byteLength);
      for (let i = byteLength - 1; i >= 0; i--) {
          bytes[i] = num & 0xff;
          num >>= 8;
      }
      return bytes;
  }

  // Helper function to convert a bigint to a byte array (big-endian)
  function bigintToBytesBE(bigint: bigint, byteLength: number): Uint8Array {
      const bytes = new Uint8Array(byteLength);
      const byteMask = BigInt(0xff); // 使用 BigInt 构造函数
      const byteShift = BigInt(8); // 使用 BigInt 构造函数
      for (let i = byteLength - 1; i >= 0; i--) {
          bytes[i] = Number(bigint & byteMask);
          bigint >>= byteShift;
      }
      return bytes;
  }

  // Decode the hex strings to byte arrays
  const userPubkeyBytes = hexToBytes(userPubkey);
  const xudtArgsBytes = hexToBytes(xudtArgs);

  // Convert slipPoint and desiredAmount to byte arrays
  const slipPointBytes = numberToBytesBE(slipPoint, 2);
  const desiredAmountBytes = bigintToBytesBE(desiredAmount, 16);

  // Concatenate all byte arrays
  const args = new Uint8Array(
      userPubkeyBytes.length + xudtArgsBytes.length + slipPointBytes.length + desiredAmountBytes.length
  );
  args.set(userPubkeyBytes, 0);
  args.set(xudtArgsBytes, userPubkeyBytes.length);
  args.set(slipPointBytes, userPubkeyBytes.length + xudtArgsBytes.length);
  args.set(desiredAmountBytes, userPubkeyBytes.length + xudtArgsBytes.length + slipPointBytes.length);

  // Convert the concatenated byte array to a hex string
  return '0x' + Array.from(args).map(byte => byte.toString(16).padStart(2, '0')).join('');
}


export default function TransferXUdt() {
  const { signer, createSender } = useApp();
  const { log } = createSender("bonding-curve trade xUDT");

  const { explorerTransaction } = useGetExplorerLink();

  const [buyXudtAmount, setBuyXudtAmount] = useState("");
  const [sellXudtAmount, setSellXudtAmount] = useState("");
  const [estimatedCkb, setEstimatedCkb] = useState("");
  const [estimatedCkbForSell, setEstimatedCkbForSell] = useState("");
  const [ckbAmount, setCkbAmount] = useState(""); // 新增的CKB输入框状态
  const type_args = "0x98ea8f018c7b180a72fff7c592df0f5b239fae0ef9893ed8754c2c32ee7efdfe";
  const bondings_code_hash="0xb1f9e1dcd0888173dec19f244edba61780536dbe75431c91519f96b9dcaae5a1"
  const boundingsLock = new ccc.Script(bondings_code_hash, "type", type_args);
  const order_code_hash = "0xbc1d00094c1741a573599bfc15b6b192f0ff1546b44cc1c6d3c093c1f49e95ec"
  const ckb_args="0x0000000000000000000000000000000000000000000000000000000000000000"


  // const CellDepsTxHash = "0xd6a1ba4b8e43384e490615715b768883c1e5f28b2f54d501eb62272d0011879d"
  //const type = await ccc.Script.fromKnownScript(signer.client, ccc.KnownScript.XUdt, "0x756defe0217d1ba946cf67966498ec8d72cfe227632d3c3226dc38ee9ae4ee3d");
  // 将type一开始就定义好，构造异步函数，然后在useEffect中调用
  

  useEffect(() => {
    const calculateEstimatedCkb = async () => {
      if (buyXudtAmount === "") {
        setEstimatedCkb("");
        return;
      }
      const buyAmount = ccc.fixedPointFrom(buyXudtAmount);
      let poolXudtAmount = BigInt(0);

      if (!signer) {
        return;
      }
      const type = await ccc.Script.fromKnownScript(signer.client, ccc.KnownScript.XUdt, type_args);

      const poolCells = [];
      const boundingsCell = signer.client.findCellsOnChain({
        script: boundingsLock,
        scriptType: "lock",
        scriptSearchMode: "exact",
      });

      for await (const cell of boundingsCell) {
        console.log("cell", cell);
        console.log("txHash", cell.outPoint.txHash);
        
        poolCells.push(cell);
        if (cell.cellOutput.type?.args === type.args) {
          poolXudtAmount += udtBalanceFrom(cell.outputData);
        }
      }

      const shouldPayCkbAmount = getBuyPriceAfterFee(TOTAL_XUDT_SUPPLY - poolXudtAmount, buyAmount);
      console.log("shouldPayCkbAmount", shouldPayCkbAmount);
      setEstimatedCkb(ccc.fixedPointToString(shouldPayCkbAmount, 8));
    };

    const intervalId = setInterval(calculateEstimatedCkb, 3000);
    calculateEstimatedCkb();

    return () => clearInterval(intervalId);

  }, [buyXudtAmount, signer]);

  useEffect(() => {
    const calculateEstimatedCkbForSell = async () => {
      if (sellXudtAmount === "") {
        setEstimatedCkbForSell("");
        return;
      }
      const sellAmount = ccc.fixedPointFrom(sellXudtAmount);
      let poolXudtAmount = BigInt(0);

      
      if (!signer) {
        return;
      }
      const type = await ccc.Script.fromKnownScript(signer.client, ccc.KnownScript.XUdt, type_args);

      const poolCells = [];
      const boundingsCell = signer.client.findCellsOnChain({
        script: boundingsLock,
        scriptType: "lock",
        scriptSearchMode: "exact",
      });

      for await (const cell of boundingsCell) {
        poolCells.push(cell);
        if (cell.cellOutput.type?.args === type.args) {
          poolXudtAmount += udtBalanceFrom(cell.outputData);
        }
      }
      console.log("poolXudtAmount", poolXudtAmount);
      
      const canGetCkbAmount = getSellPriceAfterFee(TOTAL_XUDT_SUPPLY - poolXudtAmount, sellAmount);
      console.log("canGetCkbAmount", canGetCkbAmount);
      setEstimatedCkbForSell(ccc.fixedPointToString(canGetCkbAmount, 8));
    };
    const intervalId = setInterval(calculateEstimatedCkbForSell, 3000);
    calculateEstimatedCkbForSell();

    return () => clearInterval(intervalId);
  }, [sellXudtAmount, signer]);

  useEffect(() => {
    const calculateEstimatedXudt = async () => {
      if (ckbAmount === "") {
        return;
      }
      const targetSummation = ccc.fixedPointFrom(ckbAmount);
      let poolXudtAmount = BigInt(0);

      if (!signer) {
        return;
      }
      const type = await ccc.Script.fromKnownScript(signer.client, ccc.KnownScript.XUdt, type_args);

      const poolCells = [];
      const boundingsCell = signer.client.findCellsOnChain({
        script: boundingsLock,
        scriptType: "lock",
        scriptSearchMode: "exact",
      });

      for await (const cell of boundingsCell) {
        console.log("cell", cell);
        poolCells.push(cell);
        if (cell.cellOutput.type?.args === type.args) {
          poolXudtAmount += udtBalanceFrom(cell.outputData);
        }
      }
      
      const xudtAmount = findAmount(TOTAL_XUDT_SUPPLY - poolXudtAmount, targetSummation, 10000, 'buy');
      console.log("xudtAmount", xudtAmount);
      setBuyXudtAmount(ccc.fixedPointToString(xudtAmount || BigInt(0), 8));
      // setEstimatedXudt(ccc.fixedPointToString(xudtAmount || BigInt(0), 8));
    };

    const intervalId = setInterval(calculateEstimatedXudt, 3000);
    calculateEstimatedXudt();

    return () => clearInterval(intervalId);

    
  }, [ckbAmount, signer]);

  return (
    <div className="flex w-full flex-col items-stretch">
    <TextInput
        label="Enter CKB Amount"
        placeholder="Amount of CKB to spend"
        state={[ckbAmount, setCkbAmount]}
      />
      <div className="mt-2">
        <span>Estimated xUDT to Receive: {buyXudtAmount}</span>
      </div>
      <TextInput
        label="Buy BCTK"
        placeholder="Amount of xUDT to buy"
        state={[buyXudtAmount, setBuyXudtAmount]}
      />
      <div className="mt-2">
        <span>Estimated CKB to Pay: {estimatedCkb}</span>
      </div>
      <TextInput
        label="Sell BCTK"
        placeholder="Amount of xUDT to sell"
        state={[sellXudtAmount, setSellXudtAmount]}
      />
      <div className="mt-2">
        <span>Estimated CKB to Receive: {estimatedCkbForSell}</span>
      </div>
      <ButtonsPanel>
        <Button
          className="self-center"
          onClick={async () => {
            if (!signer || buyXudtAmount === "") {
              return;
            }
            const receiver = await signer.getRecommendedAddress() 
            const { script: lock } = await ccc.Address.fromString(
                receiver,
                signer.client,
              );
            const buyAmount = ccc.fixedPointFrom(buyXudtAmount);
            let poolXudtAmount = BigInt(0);
            let poolXudtCell:ccc.Cell | undefined;
            const poolCells = [];
            const type = await ccc.Script.fromKnownScript(signer.client, ccc.KnownScript.XUdt, type_args);

            const boundingsCell =signer.client.findCellsOnChain({
              script: boundingsLock,
              scriptType: "lock",
              scriptSearchMode: "exact",
            });

            for await (const cell of boundingsCell) {
              console.log("cell", cell);
              poolCells.push(cell);
              if (cell.cellOutput.type?.args === type.args) {
                poolXudtAmount += udtBalanceFrom(cell.outputData);
                poolXudtCell = cell;
              }
            }
            console.log("poolXudtCell", poolXudtCell);

            const shouldPayCkbAmount = getBuyPriceAfterFee(TOTAL_XUDT_SUPPLY - poolXudtAmount, buyAmount);
            console.log("shouldPayCkbAmount", shouldPayCkbAmount);
            let poolCkbCell;
            for (const cell of poolCells) {
              if (cell.cellOutput.type == undefined) {
                poolCkbCell = cell;
              }
            }
            console.log("poolCkbCell", poolCkbCell);
            // 默认1%的滑点
            const order_lock_args = constructArgs(lock.args,type_args,100,buyAmount)
            console.log("order_lock_args",order_lock_args);
            const orderLock =new ccc.Script(order_code_hash,"type",order_lock_args as ccc.Hex)
            // let tx: ccc.Transaction;
            const tx = ccc.Transaction.from({
              inputs: [],
              outputs: [
                // 订单锁，其中144为xudt的包装费，should_pay_ckb_amount为支付到pool的数量
                {  capacity:ccc.fixedPointFrom(144)+shouldPayCkbAmount,lock:orderLock },
              ],
            });
            // if (poolCkbCell){
              
            // }else {
            //   tx = ccc.Transaction.from({
            //     inputs: [new ccc.CellInput(poolXudtCell!.outPoint, BigInt(0))],
            //     outputs: [
            //       { lock: boundingsLock, type },
            //       { capacity: shouldPayCkbAmount + BigInt(100*100000000), lock: boundingsLock },
            //       { capacity: ccc.fixedPointFrom(144), lock, type },
            //     ],
            //     outputsData: [
            //       ccc.numLeToBytes(udtBalanceFrom(poolXudtCell!.outputData) - buyAmount, 16),
            //       "0x",
            //       ccc.numLeToBytes(buyAmount, 16),
            //     ]
            //   });
            // }

            

            // await tx.addCellDepsOfKnownScripts(signer.client, ccc.KnownScript.XUdt);
            // tx.addCellDepsAtStart(new ccc.CellDep(new ccc.OutPoint(CellDepsTxHash, BigInt(0)), ccc.depTypeFrom("code")) as ccc.CellDepLike);
            // await tx.completeInputsByUdt(signer, type);
            await tx.completeFeeBy(signer, 1000);
            const distributeTxHash = await signer.sendTransaction(tx);
            log("Transaction sent:", explorerTransaction(distributeTxHash));
          }}
        >
          Buy
        </Button>
        <Button
          className="self-center"
          onClick={async () => {
            if (!signer || sellXudtAmount === "") {
              return;
            }
            const receiver = await signer.getRecommendedAddress() 
            const { script: lock } = await ccc.Address.fromString(
                receiver,
                signer.client,
              );
            const sellAmount = ccc.fixedPointFrom(sellXudtAmount);
            let poolXudtAmount = BigInt(0);
            let poolXudtCell:ccc.Cell | undefined;
            const poolCells = [];
            const type = await ccc.Script.fromKnownScript(signer.client, ccc.KnownScript.XUdt, type_args);

            const boundingsCell = signer.client.findCellsOnChain({
              script: boundingsLock,
              scriptType: "lock",
              scriptSearchMode: "exact",
            });

            for await (const cell of boundingsCell) {
              poolCells.push(cell);
              if (cell.cellOutput.type?.args === type.args) {
                poolXudtAmount += udtBalanceFrom(cell.outputData);
                poolXudtCell = cell;
              }
            }
            console.log("poolXudtCell", poolXudtCell);
            const canGetCkbAmount = getSellPriceAfterFee(TOTAL_XUDT_SUPPLY - poolXudtAmount, sellAmount);
            console.log("canGetCkbAmount", canGetCkbAmount);
            const order_lock_args = constructArgs(lock.args,ckb_args,100,canGetCkbAmount)
            const orderLock =new ccc.Script(order_code_hash,"type",order_lock_args as ccc.Hex)
            // if (canGetCkbAmount < ccc.fixedPointFrom(64)) {
            //   error("can not sell less than 64 CKB");
            //   return;
            // }
            let poolCkbCell;
            for (const cell of poolCells) {
              if (cell.cellOutput.capacity > canGetCkbAmount && cell.cellOutput.type == undefined) {
                poolCkbCell = cell;
              }
            }
            console.log("poolCkbCell", poolCkbCell);

            const tx = ccc.Transaction.from({
              inputs: [
              ],
              outputs: [
                // 订单锁，其中144为xudt的包装费，should_pay_ckb_amount为支付到pool的数量
                  {  lock:orderLock,type },
              ],
              outputsData: [
                ccc.numLeToBytes(sellAmount,16),
              ]
            });

            await tx.addCellDepsOfKnownScripts(signer.client, ccc.KnownScript.XUdt);
            // tx.addCellDepsAtStart(new ccc.CellDep(new ccc.OutPoint(CellDepsTxHash, BigInt(0)), ccc.depTypeFrom("code")) as ccc.CellDepLike);
            await tx.completeInputsByUdt(signer, type);
            const balanceDiff =
                (await tx.getInputsUdtBalance(signer.client, type)) -
                tx.getOutputsUdtBalance(type);
              const myInputXudtAmount = await tx.getInputsUdtBalance(signer.client, type)
              console.log("myInputXudtAmount",myInputXudtAmount);
              console.log("balanceDiff",balanceDiff);
              if (balanceDiff > ccc.Zero) {
                // Add UDT change
                tx.addOutput(
                  {
                    lock,
                    type,
                  },
                  ccc.numLeToBytes(balanceDiff, 16),
                );
              }
            // Complete missing parts: Fill inputs
            await tx.completeInputsByCapacity(signer);
            await tx.completeFeeBy(signer, 1000);
            console.log("tx", tx);
            const distributeTxHash = await signer.sendTransaction(tx);
            log("Transaction sent:", explorerTransaction(distributeTxHash));
          }}
        >
          Sell
        </Button>
      </ButtonsPanel>
    </div>
  );
}