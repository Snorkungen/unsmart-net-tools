import CalculatorSubnetIPV4 from "./views/calculator-subnet";
import PacketCaptureViewer from "./views/packet-capture";
import { TestingComponent } from "./views/testing-component";
import { Component } from "solid-js";

export const views: [Component, string][] = [
    [CalculatorSubnetIPV4, "Subnet Calculator"],
    [TestingComponent, "Testing Component"],
    [PacketCaptureViewer, "Packet Capture Viewer"]
];