import CalculatorSubnetIPV4 from "./views/calculator-subnet";
import PacketCaptureViewer from "./views/packet-capture";
import { TestingComponent } from "./views/testing-component";
import { Component } from "solid-js";
import { Buffer } from "buffer";

window.Buffer = Buffer;

export const views: [Component, string][] = [
    [CalculatorSubnetIPV4, "Subnet Calculator"],
    [TestingComponent, "Testing Component"],
    [PacketCaptureViewer, "Packet Capture Viewer"]
];