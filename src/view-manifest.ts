import CalculatorSubnetIPV4 from "./views/calculator-subnet";
import NetworkMap from "./views/network-map";
import PacketCaptureViewer from "./views/packet-capture";
import { TestingComponent } from "./views/testing-component";
import { Component } from "solid-js";
import { TestingComponent2 } from "./views/testing-component2";

export const views: [Component, string][] = [
    [NetworkMap, "Network Map"],
    [CalculatorSubnetIPV4, "Subnet Calculator"],
    [TestingComponent, "Testing Component"],
    [TestingComponent2, "Testing Component 2"],
    [PacketCaptureViewer, "Packet Capture Viewer"]
];